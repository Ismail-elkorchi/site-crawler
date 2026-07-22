import { PolitenessController } from "../politeness/index.js";
import { ResourceProcessor } from "../resources/resource-processor.js";
import { RunFinalizer } from "./finalizer.js";
import { RedirectTargetPolicy } from "./redirect-target-policy.js";
import { RequestHandler } from "./request-handler.js";
import { RequestPolicyRunner } from "./request-policy.js";
import { RequestTerminalizer } from "./request-terminalizer.js";
import { RetryingFetcher } from "./retrying-fetcher.js";
import type { RuntimeComponents } from "./runtime-components.js";
import type { RuntimeFoundation } from "./runtime-foundation.js";
import { WorkerPool } from "./worker-pool.js";

export function createRuntimeExecution(
  foundation: RuntimeFoundation,
): RuntimeComponents {
  const resources = createResources(foundation);
  const terminalizer = new RequestTerminalizer({
    runId: foundation.runId,
    counters: foundation.counters,
    frontier: foundation.frontier,
    store: foundation.store,
    extensions: foundation.extensions,
    extensionRunner: foundation.extensionRunner,
    context: () => foundation.contextFactory.create(),
    emit: (event) => foundation.dispatcher.emit(event),
  });
  const handler = new RequestHandler({
    runId: foundation.runId,
    counters: foundation.counters,
    frontier: foundation.frontier,
    store: foundation.store,
    scheduler: foundation.scheduler,
    policy: new RequestPolicyRunner(
      foundation.scope,
      foundation.safety,
      foundation.robots,
      foundation.seeds,
    ),
    middlewares: foundation.middlewares,
    fetcher: createRetryingFetcher(foundation),
    resources,
    controller: foundation.controller,
    extensions: foundation.extensions,
    extensionRunner: foundation.extensionRunner,
    terminalizer,
    context: () => foundation.contextFactory.create(),
    emit: (event) => foundation.dispatcher.emit(event),
  });
  const workerPool = new WorkerPool({
    frontier: foundation.frontier,
    politeness: new PolitenessController(foundation.config),
    handler,
    robots: foundation.robots,
    controller: foundation.controller,
    counters: foundation.counters,
    workerCount: foundation.config.network.maxConcurrency,
    leaseRenewalIntervalMs: foundation.config.storage.leaseRenewalIntervalMs,
    runId: foundation.runId,
    emit: (event) => foundation.dispatcher.emit(event),
  });
  const finalizer = new RunFinalizer({ ...foundation, resources });
  return { ...foundation, resources, workerPool, finalizer };
}

function createResources(foundation: RuntimeFoundation): ResourceProcessor {
  return new ResourceProcessor({
    runId: foundation.runId,
    config: foundation.config,
    extensions: foundation.extensions,
    extensionRunner: foundation.extensionRunner,
    counters: foundation.counters,
    store: foundation.store,
    session: foundation.session,
    scope: foundation.scope,
    context: () => foundation.contextFactory.create(),
    emit: (event) => foundation.dispatcher.emit(event),
    seedForRequest: (request) => foundation.seeds.forRequest(request),
    enqueue: async (
      rawUrl,
      referrerUrl,
      source,
      depth,
      seed,
      sitemapIndexDepth,
      sitemapAncestors,
    ) =>
      await foundation.scheduler.enqueue(
        rawUrl,
        referrerUrl,
        source,
        depth,
        seed,
        sitemapIndexDepth,
        sitemapAncestors,
      ),
    onLimit: (limit) => foundation.controller.noteLimit(limit),
    afterResource: async (resource) =>
      await foundation.middlewares.afterResource(resource, (reason) =>
        foundation.controller.cancel(reason),
      ),
  });
}

function createRetryingFetcher(foundation: RuntimeFoundation): RetryingFetcher {
  return new RetryingFetcher({
    runId: foundation.runId,
    config: foundation.config,
    fetcher: foundation.httpClient,
    store: foundation.store,
    frontier: foundation.frontier,
    seeds: foundation.seeds,
    redirects: new RedirectTargetPolicy(
      foundation.scope,
      foundation.safety,
      foundation.robots,
      foundation.counters,
    ),
    counters: foundation.counters,
    emit: (event) => foundation.dispatcher.emit(event),
  });
}
