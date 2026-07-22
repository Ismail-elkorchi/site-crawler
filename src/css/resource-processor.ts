import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlerContext, CrawlCounters } from "../crawler/types.js";
import type { ExtensionRunner } from "../extensions/runner.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import { createLinkEdge } from "../links/factory.js";
import type { EnqueueDecision, LinkEdge } from "../links/types.js";
import type { CrawlRequest, ResolvedSeed } from "../requests/types.js";
import type { ResultStore } from "../storage/index.js";
import { extractStaticCssLinks } from "./index.js";

export interface CssResourceProcessorDependencies {
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
    source: "css-static",
    depth: number,
    seed: ResolvedSeed,
  ): Promise<EnqueueDecision>;
}

export class CssResourceProcessor {
  private readonly deps: CssResourceProcessorDependencies;

  public constructor(deps: CssResourceProcessorDependencies) {
    this.deps = deps;
  }

  public async process(
    stylesheet: string,
    request: CrawlRequest,
    finalUrl: string,
  ): Promise<void> {
    const links = extractStaticCssLinks(stylesheet, this.deps.config);
    const seed = this.deps.seedForRequest(request);
    const edges: LinkEdge[] = [];
    for (const link of links) {
      const decision = await this.decision(link.raw, finalUrl, request, seed);
      const edge = createLinkEdge({
        runId: this.deps.runId,
        fromUrl: finalUrl,
        raw: link.raw,
        source: link.source,
        kind: link.kind,
        anchorText: link.anchorText,
        rel: link.rel,
        target: link.target,
        depth: request.depth + 1,
        evidence: link.evidence,
        enqueueDecision: decision,
      });
      edges.push(edge);
      await this.deps.store.writeLink(edge);
    }
    this.deps.counters.cssStylesheetsParsed += 1;
    this.deps.counters.cssLinksExtracted += links.length;
    this.deps.counters.linksExtracted += links.length;
    await this.invokeHook(finalUrl, request.id, edges);
  }

  private async decision(
    rawUrl: string,
    finalUrl: string,
    request: CrawlRequest,
    seed: ResolvedSeed | null,
  ): Promise<EnqueueDecision> {
    if (!this.deps.config.cssDiscovery.enqueueDiscoveredUrls || seed === null)
      return {
        status: "asset_skipped",
        reason: "CSS discovery enqueue disabled",
        requestId: null,
      };
    return await this.deps.enqueue(
      rawUrl,
      finalUrl,
      "css-static",
      request.depth + 1,
      seed,
    );
  }

  private async invokeHook(
    url: string,
    requestId: string,
    edges: readonly LinkEdge[],
  ): Promise<void> {
    const hook = this.deps.extensions.hooks.onLinksExtracted;
    if (hook === undefined) return;
    await this.deps.extensionRunner.invoke(
      "onLinksExtracted hook",
      { scope: "request", url, requestId },
      async () => {
        await hook(this.deps.context(), edges);
      },
    );
  }
}
