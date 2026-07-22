import { nowIso } from "../core/utils.js";
import { crawlError } from "../diagnostics/factory.js";
import type { CrawlError } from "../diagnostics/types.js";
import type { CrawlEvent } from "../events/types.js";
import { responseBodySize } from "../http/body.js";
import { ExtensionFailure } from "../extensions/failure.js";
import type { ExtensionRunner } from "../extensions/runner.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { Frontier, RequestLease } from "../frontier/index.js";
import type { CrawlRequest } from "../requests/types.js";
import type { ResourceProcessor } from "../resources/resource-processor.js";
import type { ResultStore } from "../storage/index.js";
import { cancellationReason } from "../runtime/cancellation.js";
import type { RunController } from "../runtime/run-controller.js";
import type { MiddlewareRunner } from "./middleware-runner.js";
import type { RequestPolicyRunner } from "./request-policy.js";
import type { RequestScheduler } from "./request-scheduler.js";
import type { RetryingFetcher } from "./retrying-fetcher.js";
import {
  RequestTerminalizer,
  TerminalPersistenceError,
} from "./request-terminalizer.js";
import type { CrawlerContext, CrawlCounters, RequestOutcome } from "./types.js";

export interface RequestHandlerDependencies {
  readonly runId: string;
  readonly counters: CrawlCounters;
  readonly store: ResultStore;
  readonly frontier: Frontier;
  readonly scheduler: RequestScheduler;
  readonly policy: RequestPolicyRunner;
  readonly middlewares: MiddlewareRunner;
  readonly fetcher: RetryingFetcher;
  readonly resources: ResourceProcessor;
  readonly controller: RunController;
  readonly extensions: ResolvedCrawlerExtensions;
  readonly extensionRunner: ExtensionRunner;
  readonly terminalizer: RequestTerminalizer;
  context(): CrawlerContext;
  emit(event: CrawlEvent): void;
}

export class RequestHandler {
  private readonly deps: RequestHandlerDependencies;

  public constructor(deps: RequestHandlerDependencies) {
    this.deps = deps;
  }

  public async handle(
    lease: RequestLease,
    signal: AbortSignal,
  ): Promise<RequestOutcome> {
    let terminal = false;
    try {
      await this.start(lease.request);
      const middleware = await this.deps.middlewares.beforeRequest(
        lease.request,
        signal,
      );
      if (middleware.kind !== "continue") {
        return await this.applyMiddleware(middleware, lease.request, lease);
      }
      const policy = await this.deps.policy.decide(lease.request);
      if (policy.kind === "skip") {
        await this.deps.scheduler.recordSkipped(
          lease.request.rawUrl,
          lease.request.referrerUrl,
          lease.request.resolvedUrl,
          lease.request.normalizedUrl,
          policy.reason,
          policy.policyName,
          policy.detail,
        );
        terminal = true;
        return await this.deps.terminalizer.skipped(lease, policy.detail);
      }
      const fetched = await this.deps.fetcher.fetch(lease.request, signal);
      if (signal.aborted || fetched.error?.code === "FETCH_ABORTED") {
        terminal = true;
        return await this.deps.terminalizer.cancelled(
          lease,
          cancellationReason(signal),
        );
      }
      if (fetched.error !== null) {
        this.deps.counters.requestsTransportFailed += 1;
        terminal = true;
        return await this.deps.terminalizer.failed(lease, fetched.error, true);
      }
      this.deps.controller.recordFetched(
        fetched.decodedBytesRead ?? responseBodySize(fetched.body),
        fetched.responseTimeMs,
      );
      this.deps.counters.redirectsFollowed += fetched.redirects.length;
      await this.deps.resources.processFetchedResource(
        lease.request,
        fetched,
        policy.scope,
        policy.robots,
        policy.safety,
        signal,
      );
      terminal = true;
      return await this.deps.terminalizer.handled(
        lease,
        fetched.statusCode,
        fetched.responseTimeMs,
        fetched.timings.firstByteMs ?? fetched.responseTimeMs,
      );
    } catch (caught) {
      if (terminal || caught instanceof TerminalPersistenceError) throw caught;
      if (signal.aborted) {
        return await this.deps.terminalizer.cancelled(
          lease,
          cancellationReason(signal),
        );
      }
      if (caught instanceof ExtensionFailure) {
        await this.deps.terminalizer.failed(lease, caught.crawlError, false);
        if (caught.mode === "fail-run") throw caught;
        return {
          kind: "request-failed",
          statusCode: null,
          responseTimeMs: 0,
          latencyMs: 0,
        };
      }
      const fatal = fatalCrawlerError(caught);
      await this.deps.terminalizer.failed(lease, fatal, true);
      throw new FatalRequestError(fatal);
    }
  }

  public async cancelLease(
    lease: RequestLease,
    reason: string,
  ): Promise<RequestOutcome> {
    return await this.deps.terminalizer.cancelled(lease, reason);
  }

  private async start(request: CrawlRequest): Promise<void> {
    await this.deps.store.writeRequestState(
      this.deps.frontier.stateRecord(request, "in_progress", null),
    );
    this.deps.emit({
      type: "request-started",
      runId: this.deps.runId,
      requestId: request.id,
      url: request.normalizedUrl,
      createdAt: nowIso(),
    });
    const hook = this.deps.extensions.hooks.beforeRequest;
    if (hook !== undefined) {
      await this.deps.extensionRunner.invoke(
        "beforeRequest hook",
        { scope: "request", url: request.normalizedUrl, requestId: request.id },
        async () => await hook(this.deps.context(), request),
      );
    }
  }

  private async applyMiddleware(
    decision: Exclude<
      import("../extensions/types.js").RequestMiddlewareDecision,
      { readonly kind: "continue" }
    >,
    request: CrawlRequest,
    lease: RequestLease,
  ): Promise<RequestOutcome> {
    if (decision.kind === "skip") {
      await this.deps.scheduler.recordSkipped(
        request.rawUrl,
        request.referrerUrl,
        request.resolvedUrl,
        request.normalizedUrl,
        decision.reason,
        "middleware",
        decision.detail,
      );
      return await this.deps.terminalizer.skipped(lease, decision.detail);
    }
    if (decision.kind === "fail") {
      return await this.deps.terminalizer.failed(lease, decision.error, true);
    }
    this.deps.controller.cancel(decision.reason);
    return await this.deps.terminalizer.cancelled(lease, decision.reason);
  }
}

class FatalRequestError extends Error {
  public override readonly name = "FatalRequestError";
  public readonly crawlError: CrawlError;
  public constructor(error: CrawlError) {
    super(error.message);
    this.crawlError = error;
  }
}

export function fatalCrawlerError(caught: unknown): CrawlError {
  if (caught instanceof FatalRequestError) return caught.crawlError;
  if (caught instanceof ExtensionFailure) return caught.crawlError;
  return crawlError({
    code: "INTERNAL_ERROR",
    message: "Fatal crawler error",
    fatal: true,
    cause: caught,
  });
}
