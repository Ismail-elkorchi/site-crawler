import { faultPoint } from "../faults/injector.js";
import { nowIso } from "../core/utils.js";
import type { CrawlError } from "../diagnostics/types.js";
import type { CrawlEvent } from "../events/types.js";
import type { ExtensionRunner } from "../extensions/runner.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { Frontier, RequestLease } from "../frontier/index.js";
import type { TerminalRequestState } from "../requests/types.js";
import type { ResultStore } from "../storage/index.js";
import type { CrawlerContext, CrawlCounters, RequestOutcome } from "./types.js";

export class TerminalPersistenceError extends Error {
  public override readonly name = "TerminalPersistenceError";
  public readonly terminalState: TerminalRequestState;

  public constructor(state: TerminalRequestState, cause: unknown) {
    super(
      `Request reached '${state}' but terminal output persistence failed.`,
      {
        cause,
      },
    );
    this.terminalState = state;
  }
}

export interface RequestTerminalizerDependencies {
  readonly runId: string;
  readonly counters: CrawlCounters;
  readonly frontier: Frontier;
  readonly store: ResultStore;
  readonly extensions: ResolvedCrawlerExtensions;
  readonly extensionRunner: ExtensionRunner;
  context(): CrawlerContext;
  emit(event: CrawlEvent): void;
}

export class RequestTerminalizer {
  private readonly deps: RequestTerminalizerDependencies;

  public constructor(deps: RequestTerminalizerDependencies) {
    this.deps = deps;
  }

  public async handled(
    lease: RequestLease,
    statusCode: number | null,
    responseTimeMs: number,
    latencyMs: number,
  ): Promise<RequestOutcome> {
    await this.transition(lease, "handled", null);
    return { kind: "fetched", statusCode, responseTimeMs, latencyMs };
  }

  public async skipped(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestOutcome> {
    await this.transition(lease, "skipped", reason);
    this.deps.counters.requestsPolicySkipped += 1;
    return {
      kind: "skipped",
      statusCode: null,
      responseTimeMs: 0,
      latencyMs: 0,
    };
  }

  public async cancelled(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestOutcome> {
    await this.transition(lease, "cancelled", reason);
    this.deps.counters.requestsCancelled += 1;
    return {
      kind: "cancelled",
      statusCode: null,
      responseTimeMs: 0,
      latencyMs: 0,
    };
  }

  public async failed(
    lease: RequestLease,
    error: CrawlError,
    persistError: boolean,
  ): Promise<RequestOutcome> {
    await this.transition(lease, "failed", error.message);
    this.deps.counters.requestsFailed += 1;
    if (persistError) await this.deps.store.writeError(error);
    this.deps.emit({
      type: "request-failed",
      runId: this.deps.runId,
      requestId: lease.request.id,
      url: lease.request.normalizedUrl,
      code: error.code,
      createdAt: nowIso(),
    });
    const hook = this.deps.extensions.hooks.onRequestFailed;
    if (hook !== undefined) {
      await this.deps.extensionRunner.invoke(
        "onRequestFailed hook",
        {
          scope: "request",
          url: lease.request.normalizedUrl,
          requestId: lease.request.id,
        },
        async () => await hook(this.deps.context(), error),
      );
    }
    return {
      kind: "request-failed",
      statusCode: null,
      responseTimeMs: 0,
      latencyMs: 0,
    };
  }

  private async transition(
    lease: RequestLease,
    state: TerminalRequestState,
    reason: string | null,
  ): Promise<void> {
    faultPoint("before-terminal-transition");
    const record = await this.frontierTransition(lease, state, reason);
    try {
      await this.deps.store.writeRequestState(record);
    } catch (caught) {
      throw new TerminalPersistenceError(state, caught);
    }
    faultPoint("after-terminal-transition");
    this.deps.emit({
      type: "request-finished",
      runId: this.deps.runId,
      requestId: lease.request.id,
      url: lease.request.normalizedUrl,
      outcome: outcomeFor(state),
      createdAt: nowIso(),
    });
  }

  private async frontierTransition(
    lease: RequestLease,
    state: TerminalRequestState,
    reason: string | null,
  ) {
    if (state === "handled") return await this.deps.frontier.markHandled(lease);
    if (state === "failed")
      return await this.deps.frontier.markFailed(lease, reason);
    if (state === "skipped")
      return await this.deps.frontier.markSkipped(lease, reason);
    return await this.deps.frontier.markCancelled(lease, reason);
  }
}

function outcomeFor(
  state: TerminalRequestState,
): "fetched" | "failed" | "skipped" | "cancelled" {
  return state === "handled" ? "fetched" : state;
}
