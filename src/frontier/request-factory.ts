import type { ResolvedCrawlConfig } from "../config/types.js";
import { makeId, nowIso } from "../core/utils.js";
import type { CrawlRequest, DiscoveryRecord } from "../requests/types.js";
import type { SkippedUrl } from "../results/types.js";
import { normalizeUrl } from "../url/index.js";
import { decisionStatusForSkip, priorityForSource } from "./queue-order.js";
import type { EnqueueInput, EnqueueResult } from "./types.js";

export class FrontierRequestFactory {
  private readonly runId: string;
  private readonly config: ResolvedCrawlConfig;

  public constructor(runId: string, config: ResolvedCrawlConfig) {
    this.runId = runId;
    this.config = config;
  }

  public create(
    input: EnqueueInput,
    uniqueKey: string,
    resolvedUrl: string,
    normalizedUrl: string,
  ): CrawlRequest {
    const createdAt = nowIso();
    return {
      schemaId: "site-crawler.request",
      schemaVersion: 1,
      id: makeId("req", `${this.runId}:${uniqueKey}`),
      uniqueKey,
      rawUrl: input.rawUrl,
      resolvedUrl,
      normalizedUrl,
      referrerUrl: input.referrerUrl,
      source: input.source,
      seedUrl: input.seed.normalizedUrl,
      seedLabel: input.seed.label,
      depth: input.depth,
      sitemapIndexDepth: input.sitemapIndexDepth ?? 0,
      sitemapAncestors: input.sitemapAncestors ?? [],
      priority: priorityForSource(input.source),
      method: "GET",
      headers: {},
      renderPolicy: this.config.rendering.mode,
      retryCount: 0,
      maxRetries: this.config.network.retries,
      createdAt,
      updatedAt: createdAt,
      userData: {},
    };
  }

  public discovery(
    input: EnqueueInput,
    uniqueKey: string,
    requestId: string | null,
    resolvedUrl: string | null,
    normalizedUrl: string | null,
    firstSeen: boolean,
  ): DiscoveryRecord {
    return {
      schemaId: "site-crawler.discovery",
      schemaVersion: 1,
      runId: this.runId,
      uniqueKey,
      requestId,
      rawUrl: input.rawUrl,
      resolvedUrl,
      normalizedUrl,
      referrerUrl: input.referrerUrl,
      source: input.source,
      seedUrl: input.seed.normalizedUrl,
      seedLabel: input.seed.label,
      depth: input.depth,
      firstSeen,
      decision: {
        status: firstSeen ? "enqueued" : "already_seen",
        reason: null,
        requestId,
      },
      createdAt: nowIso(),
    };
  }

  public skipped(
    input: EnqueueInput,
    reason: SkippedUrl["reason"],
    policyName: string,
    detail: string,
  ): EnqueueResult {
    const normalized = normalizeUrl(input.rawUrl, input.referrerUrl);
    const skipped: SkippedUrl = {
      schemaId: "site-crawler.skippedUrl",
      schemaVersion: 1,
      runId: this.runId,
      rawUrl: input.rawUrl,
      resolvedUrl: normalized.ok ? normalized.value.resolvedUrl : null,
      normalizedUrl: normalized.ok ? normalized.value.normalizedUrl : null,
      referrerUrl: input.referrerUrl,
      reason,
      policyName,
      detail,
      createdAt: nowIso(),
    };
    return {
      decision: {
        status: decisionStatusForSkip(reason),
        reason: detail,
        requestId: null,
      },
      request: null,
      skipped,
      discovery: null,
      state: null,
    };
  }
}
