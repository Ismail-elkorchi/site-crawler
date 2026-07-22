import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlCounters } from "../crawler/types.js";
import { parseHttpLinkHeader } from "../http/link-header.js";
import { HtmlLinkProcessor } from "../html/link-decider.js";
import type { EnqueueDecision } from "../links/types.js";
import type {
  CrawlRequest,
  CrawlSource,
  ResolvedSeed,
} from "../requests/types.js";
import type { ResultStore } from "../storage/index.js";
import type { ScopePolicy } from "../url/index.js";

export interface HeaderLinkProcessorDependencies {
  readonly runId: string;
  readonly config: ResolvedCrawlConfig;
  readonly counters: CrawlCounters;
  readonly store: ResultStore;
  readonly scope: ScopePolicy;
  seedForRequest(request: CrawlRequest): ResolvedSeed | null;
  enqueue(
    rawUrl: string,
    referrerUrl: string | null,
    source: CrawlSource,
    depth: number,
    seed: ResolvedSeed,
  ): Promise<EnqueueDecision>;
}

export class HeaderLinkProcessor {
  private readonly links: HtmlLinkProcessor;
  private readonly deps: HeaderLinkProcessorDependencies;

  public constructor(deps: HeaderLinkProcessorDependencies) {
    this.deps = deps;
    this.links = new HtmlLinkProcessor({
      runId: deps.runId,
      config: deps.config,
      store: deps.store,
      scope: deps.scope,
      enqueue: async (rawUrl, referrerUrl, source, depth, seed) =>
        await deps.enqueue(rawUrl, referrerUrl, source, depth, seed),
    });
  }

  public async process(
    header: string | null,
    finalUrl: string,
    request: CrawlRequest,
  ): Promise<void> {
    const extracted = parseHttpLinkHeader(header);
    if (extracted.length === 0) return;
    const result = await this.links.processLinks(
      extracted,
      finalUrl,
      request,
      this.deps.seedForRequest(request),
    );
    this.deps.counters.linksExtracted += result.edges.length;
    this.deps.counters.internalLinksExtracted += result.inScopeOutgoing;
    this.deps.counters.externalLinksExtracted += result.outOfScopeOutgoing;
  }
}
