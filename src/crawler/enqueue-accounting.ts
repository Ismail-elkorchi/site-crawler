import type { Frontier, EnqueueResult } from "../frontier/index.js";
import type {
  CrawlRequest,
  CrawlSource,
  ResolvedSeed,
} from "../requests/types.js";
import type { ResultStore } from "../storage/index.js";
import type { CrawlCounters } from "./types.js";

export interface EnqueueAccountingDependencies {
  readonly counters: CrawlCounters;
  readonly frontier: Frontier;
  readonly store: ResultStore;
  onEnqueued(request: CrawlRequest): Promise<void>;
}

export class EnqueueAccounting {
  private readonly seedCounts = new Map<string, number>();
  private readonly deps: EnqueueAccountingDependencies;

  public constructor(deps: EnqueueAccountingDependencies) {
    this.deps = deps;
  }

  public restore(): void {
    this.seedCounts.clear();
    for (const count of this.deps.frontier.seedRequestCounts()) {
      this.seedCounts.set(count.seedUrl, count.count);
    }
  }

  public seedLimitReached(seed: ResolvedSeed): boolean {
    return (
      seed.maxScheduledRequests !== null &&
      (this.seedCounts.get(seed.normalizedUrl) ?? 0) >=
        seed.maxScheduledRequests
    );
  }

  public async persist(
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
    await this.deps.onEnqueued(request);
  }
}

export function isSitemapFileSource(source: CrawlSource): boolean {
  return source === "robots-sitemap" || source === "sitemap-index";
}
