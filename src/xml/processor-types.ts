import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlerContext, CrawlCounters } from "../crawler/types.js";
import type { ExtensionRunner } from "../extensions/runner.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { EnqueueDecision } from "../links/types.js";
import type { CrawlRequest, ResolvedSeed } from "../requests/types.js";
import type { LimitReason } from "../runtime/types.js";
import type { ResultStore } from "../storage/index.js";

export interface XmlResourceProcessorDependencies {
  readonly runId: string;
  readonly config: ResolvedCrawlConfig;
  readonly extensions: ResolvedCrawlerExtensions;
  readonly extensionRunner: ExtensionRunner;
  readonly counters: CrawlCounters;
  readonly store: ResultStore;
  context(): CrawlerContext;
  seedForRequest(request: CrawlRequest): ResolvedSeed | null;
  enqueue(
    rawUrl: string,
    referrerUrl: string | null,
    source: "sitemap" | "sitemap-index" | "feed",
    depth: number,
    seed: ResolvedSeed,
    sitemapIndexDepth?: number,
    sitemapAncestors?: readonly string[],
  ): Promise<EnqueueDecision>;
  onLimit(limit: LimitReason): void;
}
