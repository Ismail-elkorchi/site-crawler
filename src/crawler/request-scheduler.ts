import { nowIso } from "../core/utils.js";
import type { EnqueueDecision } from "../links/types.js";
import type {
  CrawlRequest,
  CrawlSource,
  ResolvedSeed,
} from "../requests/types.js";
import type { SkippedUrl } from "../results/types.js";
import { AsyncMutex } from "../core/concurrency/mutex.js";
import { normalizeUrl } from "../url/index.js";
import type { EnqueueInput, EnqueueResult } from "../frontier/types.js";
import type { RequestSchedulerDependencies } from "./request-scheduler-types.js";
import { SitemapBootstrap } from "./sitemap-bootstrap.js";
import { SkipRecorder } from "./skip-recorder.js";

export type { RequestSchedulerDependencies } from "./request-scheduler-types.js";

export class RequestScheduler {
  private readonly deps: RequestSchedulerDependencies;
  private readonly skipped: SkipRecorder;
  private readonly admissionMutex = new AsyncMutex();
  private readonly seedCounts = new Map<string, number>();
  private readonly sitemaps: SitemapBootstrap;

  public constructor(deps: RequestSchedulerDependencies) {
    this.deps = deps;
    this.skipped = new SkipRecorder({
      runId: deps.runId,
      writeSkippedUrls: deps.config.output.writeSkippedUrls,
      counters: deps.counters,
      extensions: deps.extensions,
      extensionRunner: deps.extensionRunner,
      store: deps.store,
      context: deps.context,
      emit: deps.emit,
    });
    this.sitemaps = new SitemapBootstrap({
      config: deps.config,
      robots: deps.robots,
      enqueue: async (rawUrl, referrerUrl, source, depth, seed) =>
        await this.enqueue(rawUrl, referrerUrl, source, depth, seed),
    });
  }

  public restoreAccounting(): void {
    this.seedCounts.clear();
    for (const count of this.deps.frontier.seedRequestCounts()) {
      this.seedCounts.set(count.seedUrl, count.count);
    }
    this.deps.scope.restoreReservations(this.deps.frontier.knownRequests());
  }

  public async enqueueSeeds(): Promise<void> {
    for (const seed of this.deps.config.seeds) {
      await this.enqueue(seed.normalizedUrl, null, "seed", 0, seed);
    }
  }

  public async discoverSitemaps(): Promise<void> {
    await this.sitemaps.run();
  }

  public async enqueue(
    rawUrl: string,
    referrerUrl: string | null,
    source: CrawlSource,
    depth: number,
    seed: ResolvedSeed | null,
    sitemapIndexDepth = 0,
    sitemapAncestors: readonly string[] = [],
  ): Promise<EnqueueDecision> {
    if (seed === null) return rejected("No seed available for request");
    // Persist admission, quotas and reservations atomically. Never await user
    // notifications under this lock: hooks may await context.enqueue themselves.
    const result = await this.admissionMutex.runExclusive(
      async () =>
        await this.admit({
          rawUrl,
          referrerUrl,
          source,
          depth,
          seed,
          sitemapIndexDepth,
          sitemapAncestors,
        }),
    );
    if (result.skipped !== null) await this.skipped.notify(result.skipped);
    if (result.request !== null) await this.notifyEnqueued(result.request);
    return result.decision;
  }

  public async recordSkipped(
    rawUrl: string,
    referrerUrl: string | null,
    resolvedUrl: string | null,
    normalizedUrl: string | null,
    reason: SkippedUrl["reason"],
    policyName: string | null,
    detail: string | null,
  ): Promise<void> {
    await this.skipped.create(
      rawUrl,
      referrerUrl,
      resolvedUrl,
      normalizedUrl,
      reason,
      policyName,
      detail,
    );
  }

  private async admit(input: EnqueueInput): Promise<AdmissionResult> {
    const { rawUrl, referrerUrl, source, depth, seed } = input;
    const normalized = normalizeUrl(rawUrl, referrerUrl);
    if (!normalized.ok) {
      return await this.enqueueThroughFrontier(input);
    }
    const uniqueKey = `${normalized.value.normalizedUrl}#GET`;
    if (this.deps.frontier.requestForKey(uniqueKey) !== null) {
      return await this.enqueueThroughFrontier(input);
    }
    if (this.sitemapLimitReached(source)) {
      this.deps.onLimit("max-sitemap-files");
      const skipped = await this.skippedRecord(
        rawUrl,
        referrerUrl,
        normalized.value.resolvedUrl,
        normalized.value.normalizedUrl,
        "SITEMAP_LIMIT_EXCEEDED",
        "sitemaps.maxSitemapFiles",
        "Maximum sitemap file count reached",
      );
      return outcome(guarded("Maximum sitemap file count reached"), skipped);
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
      const skipped = await this.skippedRecord(
        rawUrl,
        referrerUrl,
        normalized.value.resolvedUrl,
        normalized.value.normalizedUrl,
        "SCOPE_REJECTED",
        scope.policyName,
        scope.reason,
      );
      return outcome(rejected(scope.reason), skipped);
    }
    if (this.seedLimitReached(seed)) {
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
      const skipped = await this.skippedRecord(
        rawUrl,
        referrerUrl,
        normalized.value.resolvedUrl,
        normalized.value.normalizedUrl,
        reason,
        reservation.decision.policyName,
        reservation.decision.reason,
      );
      return outcome(guarded(reservation.decision.reason), skipped);
    }
    const result = await this.enqueueThroughFrontier(input);
    if (result.decision.status === "enqueued") reservation.commit();
    return result;
  }

  private sitemapLimitReached(source: CrawlSource): boolean {
    return (
      isSitemapFileSource(source) &&
      this.deps.counters.sitemapFilesDiscovered >=
        this.deps.config.sitemaps.maxSitemapFiles
    );
  }

  private seedLimitReached(seed: ResolvedSeed): boolean {
    return (
      seed.maxScheduledRequests !== null &&
      (this.seedCounts.get(seed.normalizedUrl) ?? 0) >=
        seed.maxScheduledRequests
    );
  }

  private async enqueueThroughFrontier(
    input: EnqueueInput,
  ): Promise<AdmissionResult> {
    const result = await this.deps.frontier.enqueue(input);
    if (result.skipped !== null) await this.skipped.persist(result.skipped);
    await this.persistAdmission(result, input.seed);
    return result;
  }

  private async recordRequestLimit(
    rawUrl: string,
    referrerUrl: string | null,
    resolvedUrl: string,
    normalizedUrl: string,
    detail: string,
    policyName: string,
  ): Promise<AdmissionResult> {
    const skipped = await this.skippedRecord(
      rawUrl,
      referrerUrl,
      resolvedUrl,
      normalizedUrl,
      "MAX_REQUESTS_EXCEEDED",
      policyName,
      detail,
    );
    return outcome(
      { status: "queue_limit", reason: detail, requestId: null },
      skipped,
    );
  }

  private async skippedRecord(
    rawUrl: string,
    referrerUrl: string | null,
    resolvedUrl: string | null,
    normalizedUrl: string | null,
    reason: SkippedUrl["reason"],
    policyName: string | null,
    detail: string | null,
  ): Promise<SkippedUrl> {
    const skipped = this.skipped.createRecord(
      rawUrl,
      referrerUrl,
      resolvedUrl,
      normalizedUrl,
      reason,
      policyName,
      detail,
    );
    await this.skipped.persist(skipped);
    return skipped;
  }

  private async persistAdmission(
    result: EnqueueResult,
    seed: ResolvedSeed,
  ): Promise<void> {
    if (result.discovery !== null) {
      await this.deps.store.writeDiscovery(result.discovery);
    }
    if (result.request === null) return;

    const request = result.request;
    this.deps.counters.requestsScheduled += 1;
    if (isSitemapFileSource(request.source)) {
      this.deps.counters.sitemapFilesDiscovered += 1;
    }
    this.seedCounts.set(
      seed.normalizedUrl,
      (this.seedCounts.get(seed.normalizedUrl) ?? 0) + 1,
    );
    this.deps.counters.peakQueueSize = Math.max(
      this.deps.counters.peakQueueSize,
      this.deps.frontier.size,
    );

    await this.deps.store.writeRequest(request);
    if (result.state !== null) {
      await this.deps.store.writeRequestState(result.state);
    }
  }

  private async notifyEnqueued(request: CrawlRequest): Promise<void> {
    this.deps.emit({
      type: "request-enqueued",
      runId: this.deps.runId,
      requestId: request.id,
      url: request.normalizedUrl,
      createdAt: nowIso(),
    });
    const hook = this.deps.extensions.hooks.onRequestEnqueued;
    if (hook === undefined) return;
    await this.deps.extensionRunner.invoke(
      "onRequestEnqueued hook",
      {
        scope: "request",
        url: request.normalizedUrl,
        requestId: request.id,
      },
      async () => {
        await hook(this.deps.context(), request);
      },
    );
  }
}

interface AdmissionResult {
  readonly decision: EnqueueDecision;
  readonly request: CrawlRequest | null;
  readonly skipped: SkippedUrl | null;
}

function outcome(
  decision: EnqueueDecision,
  skipped: SkippedUrl,
): AdmissionResult {
  return { decision, skipped, request: null };
}

function isSitemapFileSource(source: CrawlSource): boolean {
  return source === "robots-sitemap" || source === "sitemap-index";
}

function rejected(reason: string | null): EnqueueDecision {
  return { status: "rejected_scope", reason, requestId: null };
}

function guarded(reason: string | null): EnqueueDecision {
  return { status: "trap_guard", reason, requestId: null };
}
