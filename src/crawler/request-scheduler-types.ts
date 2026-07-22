import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlEvent } from "../events/types.js";
import type { ExtensionRunner } from "../extensions/runner.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { Frontier } from "../frontier/index.js";
import type { RobotsService } from "../robots/index.js";
import type { LimitReason } from "../runtime/types.js";
import type { ResultStore } from "../storage/index.js";
import type { ScopePolicy } from "../url/index.js";
import type { CrawlerContext, CrawlCounters } from "./types.js";

export interface RequestSchedulerDependencies {
  readonly runId: string;
  readonly config: ResolvedCrawlConfig;
  readonly counters: CrawlCounters;
  readonly extensions: ResolvedCrawlerExtensions;
  readonly extensionRunner: ExtensionRunner;
  readonly frontier: Frontier;
  readonly store: ResultStore;
  readonly scope: ScopePolicy;
  readonly robots: RobotsService;
  context(): CrawlerContext;
  emit(event: CrawlEvent): void;
  onLimit(limit: LimitReason): void;
}
