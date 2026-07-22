import { nowIso } from "../core/utils.js";
import type { EnqueueDecision } from "../links/types.js";
import type {
  CrawlRequest,
  CrawlSource,
  ResolvedSeed,
} from "../requests/types.js";
import type { SkippedUrl } from "../results/types.js";
import { RequestEnqueuer } from "./request-enqueuer.js";
import type { RequestSchedulerDependencies } from "./request-scheduler-types.js";
import { SitemapBootstrap } from "./sitemap-bootstrap.js";
import { SkipRecorder } from "./skip-recorder.js";

export type { RequestSchedulerDependencies } from "./request-scheduler-types.js";

export class RequestScheduler {
  private readonly deps: RequestSchedulerDependencies;
  private readonly skipped: SkipRecorder;
  private readonly enqueuer: RequestEnqueuer;
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
    this.enqueuer = new RequestEnqueuer({
      config: deps.config,
      counters: deps.counters,
      frontier: deps.frontier,
      store: deps.store,
      scope: deps.scope,
      skipped: this.skipped,
      onEnqueued: async (request) => await this.notifyEnqueued(request),
      onLimit: (limit) => deps.onLimit(limit),
    });
    this.sitemaps = new SitemapBootstrap({
      config: deps.config,
      robots: deps.robots,
      enqueue: async (rawUrl, referrerUrl, source, depth, seed) =>
        await this.enqueue(rawUrl, referrerUrl, source, depth, seed),
    });
  }

  public restoreAccounting(): void {
    this.enqueuer.restore();
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
    return await this.enqueuer.enqueue(
      rawUrl,
      referrerUrl,
      source,
      depth,
      seed,
      sitemapIndexDepth,
      sitemapAncestors,
    );
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
