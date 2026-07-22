import { DeferredReference } from "../core/deferred-reference.js";
import { ExtensionRunner } from "../extensions/index.js";
import { Frontier } from "../frontier/index.js";
import { HttpFetcher } from "../http/index.js";
import { SessionManager } from "../http/session/index.js";
import { resolveSessionConfig } from "../http/session/path.js";
import type { HttpClient } from "../http/types.js";
import { NetworkSafetyPolicy } from "../network/index.js";
import { RobotsService } from "../robots/index.js";
import { RunController } from "../runtime/run-controller.js";
import { createStore } from "../storage/index.js";
import { ScopePolicy } from "../url/index.js";
import { CrawlerContextFactory } from "./context-factory.js";
import { EventDispatcher } from "./event-dispatcher.js";
import { MiddlewareRunner } from "./middleware-runner.js";
import { RequestScheduler } from "./request-scheduler.js";
import { RobotsFetcher } from "./robots-fetcher.js";
import { RobotsRedirectPolicy } from "./robots-redirect-policy.js";
import { SeedResolver } from "./seed-resolver.js";
import type { RuntimeIdentity } from "./runtime-identity.js";

export interface RuntimeFoundation extends RuntimeIdentity {
  readonly frontier: Frontier;
  readonly store: ReturnType<typeof createStore>;
  readonly extensionRunner: ExtensionRunner;
  readonly scope: ScopePolicy;
  readonly safety: NetworkSafetyPolicy;
  readonly seeds: SeedResolver;
  readonly controller: RunController;
  readonly contextFactory: CrawlerContextFactory;
  readonly dispatcher: EventDispatcher;
  readonly httpClient: HttpClient;
  readonly session: SessionManager;
  readonly robots: RobotsService;
  readonly scheduler: RequestScheduler;
  readonly middlewares: MiddlewareRunner;
}

export function createRuntimeFoundation(
  identity: RuntimeIdentity,
): RuntimeFoundation {
  const controller = new RunController(identity.config, identity.counters);
  const frontier = new Frontier(identity.runId, identity.config);
  const store = createStore(identity.config, identity.runId, () => {
    identity.counters.storageBackpressureEvents += 1;
  });
  const extensionRunner = new ExtensionRunner(
    identity.extensions.failureMode,
    store,
  );
  const scope = new ScopePolicy(identity.config.scope, identity.config.seeds);
  const safety = new NetworkSafetyPolicy(identity.config.networkSafety);
  const seeds = new SeedResolver(identity.config.seeds);
  const schedulerRef = new DeferredReference<RequestScheduler>(
    "request scheduler",
  );
  const dispatcherRef = new DeferredReference<EventDispatcher>(
    "event dispatcher",
  );
  const contextFactory = new CrawlerContextFactory({
    runId: identity.runId,
    config: identity.config,
    signal: controller.cancellationSignal,
    enqueue: async (rawUrl, referrerUrl, source, depth) =>
      await schedulerRef
        .get()
        .enqueue(
          rawUrl,
          referrerUrl,
          source,
          depth,
          identity.config.seeds[0] ?? null,
        ),
    emit: (event) => dispatcherRef.get().emit(event),
    abort: (reason) => controller.cancel(reason),
  });
  const dispatcher = new EventDispatcher(
    identity.extensions,
    extensionRunner,
    () => contextFactory.create(),
    (error) => controller.failFromUnknown(error),
  );
  dispatcherRef.set(dispatcher);
  controller.observeLimits((limit) => {
    dispatcher.emit({
      type: "limit-reached",
      runId: identity.runId,
      limit,
      createdAt: new Date().toISOString(),
    });
  });
  const session = new SessionManager(
    resolveSessionConfig(identity.config, identity.runId),
  );
  const httpClient =
    identity.extensions.httpClient ??
    new HttpFetcher(identity.config, safety, session);
  const robotsFetcher = new RobotsFetcher({
    runId: identity.runId,
    config: identity.config,
    fetcher: httpClient,
    safety,
    redirects: new RobotsRedirectPolicy(scope, safety),
    seeds,
    counters: identity.counters,
    signal: controller.cancellationSignal,
  });
  const robots = new RobotsService(
    identity.config,
    async (url) => await robotsFetcher.fetch(url),
    async (record) => await store.writeRobots(record),
  );
  const scheduler = new RequestScheduler({
    runId: identity.runId,
    config: identity.config,
    counters: identity.counters,
    extensions: identity.extensions,
    extensionRunner,
    frontier,
    store,
    scope,
    robots,
    context: () => contextFactory.create(),
    emit: (event) => dispatcher.emit(event),
    onLimit: (limit) => controller.noteLimit(limit),
  });
  schedulerRef.set(scheduler);
  return {
    ...identity,
    frontier,
    store,
    extensionRunner,
    scope,
    safety,
    seeds,
    controller,
    contextFactory,
    dispatcher,
    httpClient,
    session,
    robots,
    scheduler,
    middlewares: new MiddlewareRunner(
      identity.extensions,
      extensionRunner,
      store,
      () => contextFactory.create(),
    ),
  };
}
