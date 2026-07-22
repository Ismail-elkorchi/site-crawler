import type { ResolvedCrawlConfig } from "../../config/types.js";
import type { CrawlRequest, DiscoveryRecord } from "../../requests/types.js";
import { normalizeUrl } from "../../url/index.js";
import { FrontierRequestFactory } from "../request-factory.js";
import { createRequestStateRecord } from "../state-record.js";
import type { EnqueueInput, EnqueueResult } from "../types.js";
import type { SqliteRequestRepository } from "./sqlite-request-repository.js";

interface QueueCapacity {
  pending: number;
}

export class SqliteFrontierEnqueuer {
  private readonly runId: string;
  private readonly config: ResolvedCrawlConfig;
  private readonly requests: SqliteRequestRepository;
  private readonly factory: FrontierRequestFactory;

  public constructor(
    runId: string,
    config: ResolvedCrawlConfig,
    requests: SqliteRequestRepository,
  ) {
    this.runId = runId;
    this.config = config;
    this.requests = requests;
    this.factory = new FrontierRequestFactory(runId, config);
  }

  public enqueue(input: EnqueueInput): EnqueueResult {
    return this.enqueueWithCapacity(input, {
      pending: this.requests.pendingCount(),
    });
  }

  public enqueueMany(
    inputs: readonly EnqueueInput[],
  ): readonly EnqueueResult[] {
    const capacity: QueueCapacity = {
      pending: this.requests.pendingCount(),
    };
    return inputs.map((input) => this.enqueueWithCapacity(input, capacity));
  }

  private enqueueWithCapacity(
    input: EnqueueInput,
    capacity: QueueCapacity,
  ): EnqueueResult {
    const normalized = normalizeUrl(input.rawUrl, input.referrerUrl);
    if (!normalized.ok)
      return this.factory.skipped(
        input,
        "INVALID_URL",
        "url",
        normalized.error,
      );
    const uniqueKey = `${normalized.value.normalizedUrl}#GET`;
    const existing = this.requests.requestForKey(uniqueKey);
    const discovery = this.factory.discovery(
      input,
      uniqueKey,
      existing?.id ?? null,
      normalized.value.resolvedUrl,
      normalized.value.normalizedUrl,
      existing === null,
    );
    if (existing !== null) return duplicate(existing, discovery);
    const rejected = this.rejectByLimits(input, capacity.pending);
    if (rejected !== null) return rejected;
    const request = this.factory.create(
      input,
      uniqueKey,
      normalized.value.resolvedUrl,
      normalized.value.normalizedUrl,
    );
    if (!this.requests.insert(request)) {
      const concurrent = this.requests.requestForKey(uniqueKey);
      if (concurrent === null)
        throw new Error("Frontier enqueue conflict could not be resolved.");
      return duplicate(concurrent, {
        ...discovery,
        requestId: concurrent.id,
        firstSeen: false,
      });
    }
    capacity.pending += 1;
    return {
      decision: { status: "enqueued", reason: null, requestId: request.id },
      request,
      skipped: null,
      discovery: { ...discovery, requestId: request.id },
      state: createRequestStateRecord(this.runId, request, "pending", null),
    };
  }

  private rejectByLimits(
    input: EnqueueInput,
    pendingCount: number,
  ): EnqueueResult | null {
    if (input.depth > this.config.limits.maxDepth)
      return this.factory.skipped(
        input,
        "MAX_DEPTH_EXCEEDED",
        "maxDepth",
        "Maximum depth exceeded",
      );
    return pendingCount >= this.config.limits.maxQueueSize
      ? this.factory.skipped(
          input,
          "MAX_QUEUE_SIZE_EXCEEDED",
          "maxQueueSize",
          "Maximum queue size exceeded",
        )
      : null;
  }
}

function duplicate(
  existing: CrawlRequest,
  discovery: DiscoveryRecord,
): EnqueueResult {
  return {
    decision: {
      status: "already_seen",
      reason: "Duplicate normalized URL",
      requestId: existing.id,
    },
    request: null,
    skipped: null,
    discovery,
    state: null,
  };
}
