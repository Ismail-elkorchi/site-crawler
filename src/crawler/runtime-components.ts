import type { ResolvedCrawlConfig } from "../config/types.js";
import type { ExtensionRunner } from "../extensions/runner.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { Frontier } from "../frontier/index.js";
import type { SessionManager } from "../http/session/index.js";
import type { HttpClient } from "../http/types.js";
import type { ResourceProcessor } from "../resources/resource-processor.js";
import type { RunController } from "../runtime/run-controller.js";
import type { ResultStore } from "../storage/types.js";
import type { CrawlerContextFactory } from "./context-factory.js";
import type { EventDispatcher } from "./event-dispatcher.js";
import type { RunFinalizer } from "./finalizer.js";
import type { RequestScheduler } from "./request-scheduler.js";
import type { CrawlCounters } from "./types.js";
import type { WorkerPool } from "./worker-pool.js";

export interface RuntimeComponents {
  readonly config: ResolvedCrawlConfig;
  readonly extensions: ResolvedCrawlerExtensions;
  readonly runId: string;
  readonly startedAt: string;
  readonly counters: CrawlCounters;
  readonly controller: RunController;
  readonly frontier: Frontier;
  readonly store: ResultStore;
  readonly httpClient: HttpClient;
  readonly session: SessionManager;
  readonly scheduler: RequestScheduler;
  readonly resources: ResourceProcessor;
  readonly dispatcher: EventDispatcher;
  readonly contextFactory: CrawlerContextFactory;
  readonly finalizer: RunFinalizer;
  readonly workerPool: WorkerPool;
  readonly extensionRunner: ExtensionRunner;
}
