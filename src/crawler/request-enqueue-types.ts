import type { ResolvedCrawlConfig } from "../config/types.js";
import type { Frontier } from "../frontier/index.js";
import type { CrawlRequest } from "../requests/types.js";
import type { LimitReason } from "../runtime/types.js";
import type { ResultStore } from "../storage/index.js";
import type { ScopePolicy } from "../url/index.js";
import type { SkipRecorder } from "./skip-recorder.js";
import type { CrawlCounters } from "./types.js";

export interface RequestEnqueuerDependencies {
  readonly config: ResolvedCrawlConfig;
  readonly counters: CrawlCounters;
  readonly frontier: Frontier;
  readonly store: ResultStore;
  readonly scope: ScopePolicy;
  readonly skipped: SkipRecorder;
  onEnqueued(request: CrawlRequest): Promise<void>;
  onLimit(limit: LimitReason): void;
}
