import type { ResolvedCrawlConfig } from "../config/types.js";
import { AsyncMutex } from "../core/concurrency/mutex.js";
import { nowIso } from "../core/utils.js";
import { normalizeUrl } from "../url/index.js";
import { duplicateEnqueueResult } from "./frontier-helpers.js";
import type { FrontierJournal } from "./journal.js";
import type { FrontierLeaseManager } from "./lease-manager.js";
import type { FrontierRequestFactory } from "./request-factory.js";
import type { FrontierState } from "./state.js";
import type { EnqueueInput, EnqueueResult } from "./types.js";

export interface FrontierEnqueuerDependencies {
  readonly config: ResolvedCrawlConfig;
  readonly state: FrontierState;
  readonly journal: FrontierJournal;
  readonly leases: FrontierLeaseManager;
  readonly factory: FrontierRequestFactory;
}

export class FrontierEnqueuer {
  private readonly mutex = new AsyncMutex();
  private readonly deps: FrontierEnqueuerDependencies;

  public constructor(deps: FrontierEnqueuerDependencies) {
    this.deps = deps;
  }

  public async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    return await this.mutex.runExclusive(async () => await this.execute(input));
  }

  public async enqueueMany(
    inputs: readonly EnqueueInput[],
  ): Promise<readonly EnqueueResult[]> {
    return await this.mutex.runExclusive(async () => {
      const results: EnqueueResult[] = [];
      for (const input of inputs) results.push(await this.execute(input));
      return results;
    });
  }

  private async execute(input: EnqueueInput): Promise<EnqueueResult> {
    const normalized = normalizeUrl(input.rawUrl, input.referrerUrl);
    if (!normalized.ok) {
      return this.deps.factory.skipped(
        input,
        "INVALID_URL",
        "url",
        normalized.error,
      );
    }
    const uniqueKey = `${normalized.value.normalizedUrl}#GET`;
    const existing = this.deps.state.requestForKey(uniqueKey);
    const discovery = this.deps.factory.discovery(
      input,
      uniqueKey,
      existing?.id ?? null,
      normalized.value.resolvedUrl,
      normalized.value.normalizedUrl,
      existing === null,
    );
    if (existing !== null) return duplicateEnqueueResult(existing, discovery);
    if (input.depth > this.deps.config.limits.maxDepth) {
      return this.deps.factory.skipped(
        input,
        "MAX_DEPTH_EXCEEDED",
        "maxDepth",
        "Maximum depth exceeded",
      );
    }
    if (this.deps.state.size >= this.deps.config.limits.maxQueueSize) {
      return this.deps.factory.skipped(
        input,
        "MAX_QUEUE_SIZE_EXCEEDED",
        "maxQueueSize",
        "Maximum queue size exceeded",
      );
    }
    const request = this.deps.factory.create(
      input,
      uniqueKey,
      normalized.value.resolvedUrl,
      normalized.value.normalizedUrl,
    );
    await this.deps.journal.append({
      schemaId: "site-crawler.frontierJournal",
      schemaVersion: 1,
      type: "enqueued",
      request,
      createdAt: nowIso(),
    });
    this.deps.state.addPending(request);
    this.deps.leases.restorePending(request);
    return {
      decision: { status: "enqueued", reason: null, requestId: request.id },
      request,
      skipped: null,
      discovery: { ...discovery, requestId: request.id },
      state: this.deps.leases.stateRecord(request, "pending", null),
    };
  }
}
