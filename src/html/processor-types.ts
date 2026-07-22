import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlerContext, CrawlCounters } from "../crawler/types.js";
import type { CrawlEvent } from "../events/types.js";
import type { ExtensionRunner } from "../extensions/runner.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { EnqueueDecision } from "../links/types.js";
import type { RenderController } from "../rendering/controller.js";
import type { CrawlRequest, ResolvedSeed } from "../requests/types.js";
import type { ResultStore } from "../storage/index.js";
import type { ScopePolicy } from "../url/index.js";

export interface HtmlResourceProcessorDependencies {
  readonly runId: string;
  readonly config: ResolvedCrawlConfig;
  readonly extensions: ResolvedCrawlerExtensions;
  readonly extensionRunner: ExtensionRunner;
  readonly counters: CrawlCounters;
  readonly store: ResultStore;
  readonly scope: ScopePolicy;
  readonly renderer: RenderController;
  context(): CrawlerContext;
  emit(event: CrawlEvent): void;
  seedForRequest(request: CrawlRequest): ResolvedSeed | null;
  enqueue(
    rawUrl: string,
    referrerUrl: string | null,
    source: "html-link" | "javascript-static" | "css-static" | "feed",
    depth: number,
    seed: ResolvedSeed,
  ): Promise<EnqueueDecision>;
}
