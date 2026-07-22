import type { EnqueueDecision } from "../links/types.js";
import type { CrawlSource, ResolvedSeed } from "../requests/types.js";
import { normalizeUrl } from "../url/index.js";
import type { RequestEnqueuerDependencies } from "./request-enqueue-types.js";
import {
  isSitemapFileSource,
  type EnqueueAccounting,
} from "./enqueue-accounting.js";

export class RequestEnqueueTransaction {
  private readonly deps: RequestEnqueuerDependencies;
  private readonly accounting: EnqueueAccounting;

  public constructor(
    deps: RequestEnqueuerDependencies,
    accounting: EnqueueAccounting,
  ) {
    this.deps = deps;
    this.accounting = accounting;
  }

  public restoreScopeReservations(): void {
    this.deps.scope.restoreReservations(this.deps.frontier.knownRequests());
  }

  public async execute(
    rawUrl: string,
    referrerUrl: string | null,
    source: CrawlSource,
    depth: number,
    seed: ResolvedSeed | null,
    sitemapIndexDepth: number,
    sitemapAncestors: readonly string[],
  ): Promise<EnqueueDecision> {
    if (seed === null) return rejected("No seed available for request");
    const normalized = normalizeUrl(rawUrl, referrerUrl);
    if (!normalized.ok) {
      return await this.enqueueThroughFrontier(
        rawUrl,
        referrerUrl,
        source,
        depth,
        seed,
        sitemapIndexDepth,
        sitemapAncestors,
      );
    }
    const uniqueKey = `${normalized.value.normalizedUrl}#GET`;
    if (this.deps.frontier.requestForKey(uniqueKey) !== null) {
      return await this.enqueueThroughFrontier(
        rawUrl,
        referrerUrl,
        source,
        depth,
        seed,
        sitemapIndexDepth,
        sitemapAncestors,
      );
    }
    if (this.sitemapLimitReached(source)) {
      this.deps.onLimit("max-sitemap-files");
      await this.deps.skipped.create(
        rawUrl,
        referrerUrl,
        normalized.value.resolvedUrl,
        normalized.value.normalizedUrl,
        "SITEMAP_LIMIT_EXCEEDED",
        "sitemaps.maxSitemapFiles",
        "Maximum sitemap file count reached",
      );
      return guarded("Maximum sitemap file count reached");
    }
    if (
      this.deps.counters.requestsScheduled >=
      this.deps.config.limits.maxScheduledRequests
    ) {
      this.deps.onLimit("max-scheduled-requests");
      return await this.recordRequestLimit(
        rawUrl,
        referrerUrl,
        normalized.value.resolvedUrl,
        normalized.value.normalizedUrl,
        "Maximum scheduled request count reached",
        "limits.maxScheduledRequests",
      );
    }
    const scope = this.deps.scope.decide(
      normalized.value.normalizedUrl,
      depth,
      seed.normalizedUrl,
    );
    if (!scope.allowed) {
      await this.deps.skipped.create(
        rawUrl,
        referrerUrl,
        normalized.value.resolvedUrl,
        normalized.value.normalizedUrl,
        "SCOPE_REJECTED",
        scope.policyName,
        scope.reason,
      );
      return rejected(scope.reason);
    }
    if (this.accounting.seedLimitReached(seed)) {
      return await this.recordRequestLimit(
        rawUrl,
        referrerUrl,
        normalized.value.resolvedUrl,
        normalized.value.normalizedUrl,
        "Seed scheduled request limit reached",
        "seed.maxScheduledRequests",
      );
    }
    const reservation = this.deps.scope.prepareReservation(
      normalized.value.normalizedUrl,
      seed.normalizedUrl,
    );
    if (!reservation.decision.allowed) {
      const reason =
        reservation.decision.policyName === "maxUrlsPerDirectory"
          ? "DIRECTORY_LIMIT_EXCEEDED"
          : "PATH_PATTERN_LIMIT_EXCEEDED";
      await this.deps.skipped.create(
        rawUrl,
        referrerUrl,
        normalized.value.resolvedUrl,
        normalized.value.normalizedUrl,
        reason,
        reservation.decision.policyName,
        reservation.decision.reason,
      );
      return guarded(reservation.decision.reason);
    }
    const decision = await this.enqueueThroughFrontier(
      rawUrl,
      referrerUrl,
      source,
      depth,
      seed,
      sitemapIndexDepth,
      sitemapAncestors,
    );
    if (decision.status === "enqueued") reservation.commit();
    return decision;
  }

  private sitemapLimitReached(source: CrawlSource): boolean {
    return (
      isSitemapFileSource(source) &&
      this.deps.counters.sitemapFilesDiscovered >=
        this.deps.config.sitemaps.maxSitemapFiles
    );
  }

  private async enqueueThroughFrontier(
    rawUrl: string,
    referrerUrl: string | null,
    source: CrawlSource,
    depth: number,
    seed: ResolvedSeed,
    sitemapIndexDepth: number,
    sitemapAncestors: readonly string[],
  ): Promise<EnqueueDecision> {
    const result = await this.deps.frontier.enqueue({
      rawUrl,
      referrerUrl,
      source,
      depth,
      sitemapIndexDepth,
      sitemapAncestors,
      seed,
    });
    if (result.skipped !== null) await this.deps.skipped.record(result.skipped);
    await this.accounting.persist(result, seed);
    return result.decision;
  }

  private async recordRequestLimit(
    rawUrl: string,
    referrerUrl: string | null,
    resolvedUrl: string,
    normalizedUrl: string,
    detail: string,
    policyName: string,
  ): Promise<EnqueueDecision> {
    await this.deps.skipped.create(
      rawUrl,
      referrerUrl,
      resolvedUrl,
      normalizedUrl,
      "MAX_REQUESTS_EXCEEDED",
      policyName,
      detail,
    );
    return { status: "queue_limit", reason: detail, requestId: null };
  }
}

function rejected(reason: string | null): EnqueueDecision {
  return { status: "rejected_scope", reason, requestId: null };
}

function guarded(reason: string | null): EnqueueDecision {
  return { status: "trap_guard", reason, requestId: null };
}
