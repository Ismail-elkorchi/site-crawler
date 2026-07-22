import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlEvent } from "../events/types.js";
import type { EnqueueDecision } from "../links/types.js";
import type { CrawlSource } from "../requests/types.js";
import type { CrawlerContext } from "./types.js";

export interface CrawlerContextFactoryDependencies {
  readonly runId: string;
  readonly config: ResolvedCrawlConfig;
  readonly signal: AbortSignal;
  enqueue(
    rawUrl: string,
    referrerUrl: string | null,
    source: CrawlSource,
    depth: number,
  ): Promise<EnqueueDecision>;
  emit(event: CrawlEvent): void;
  abort(reason: string): void;
}

export class CrawlerContextFactory {
  private readonly deps: CrawlerContextFactoryDependencies;

  public constructor(deps: CrawlerContextFactoryDependencies) {
    this.deps = deps;
  }

  public create(): CrawlerContext {
    return {
      runId: this.deps.runId,
      config: this.deps.config,
      signal: this.deps.signal,
      enqueue: (rawUrl, referrerUrl, source, depth) =>
        this.deps.enqueue(rawUrl, referrerUrl, source, depth),
      emit: (event) => this.deps.emit(event),
      abort: (reason) => this.deps.abort(reason),
    };
  }
}
