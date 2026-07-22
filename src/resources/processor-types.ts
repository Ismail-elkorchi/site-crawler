import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlEvent } from "../events/types.js";
import type { ExtensionRunner } from "../extensions/runner.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { EnqueueDecision } from "../links/types.js";
import type {
  CrawlRequest,
  CrawlSource,
  ResolvedSeed,
} from "../requests/types.js";
import type { SessionManager } from "../http/session/index.js";
import type { ResultStore } from "../storage/index.js";
import type { ScopePolicy } from "../url/index.js";
import type { CrawlerContext, CrawlCounters } from "../crawler/types.js";
import type { CrawledResource } from "./types.js";
export interface ResourceProcessingDependencies {
  readonly runId: string;
  readonly config: ResolvedCrawlConfig;
  readonly extensions: ResolvedCrawlerExtensions;
  readonly extensionRunner: ExtensionRunner;
  readonly counters: CrawlCounters;
  readonly store: ResultStore;
  readonly session: SessionManager;
  readonly scope: ScopePolicy;
  context(): CrawlerContext;
  emit(event: CrawlEvent): void;
  seedForRequest(request: CrawlRequest): ResolvedSeed | null;
  enqueue(
    rawUrl: string,
    referrerUrl: string | null,
    source: CrawlSource,
    depth: number,
    seed: ResolvedSeed,
    sitemapIndexDepth?: number,
    sitemapAncestors?: readonly string[],
  ): Promise<EnqueueDecision>;
  afterResource(
    resource: CrawledResource,
  ): Promise<"continue" | "abort" | "skip-processing">;
  onLimit(limit: import("../runtime/types.js").LimitReason): void;
}
