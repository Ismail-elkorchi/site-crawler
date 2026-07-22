import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlerContext, CrawlCounters } from "../crawler/types.js";
import type { ExtensionRunner } from "../extensions/runner.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import { createLinkEdge } from "../links/factory.js";
import type { EnqueueDecision, LinkEdge } from "../links/types.js";
import type { CrawlRequest, ResolvedSeed } from "../requests/types.js";
import type { ResultStore } from "../storage/index.js";
import { extractStaticJavascriptLinks } from "./index.js";
export interface JavascriptResourceProcessorDependencies {
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
    source: "javascript-static",
    depth: number,
    seed: ResolvedSeed,
  ): Promise<EnqueueDecision>;
}
export class JavascriptResourceProcessor {
  private readonly deps: JavascriptResourceProcessorDependencies;
  public constructor(deps: JavascriptResourceProcessorDependencies) {
    this.deps = deps;
  }
  public async process(
    scriptText: string,
    request: CrawlRequest,
    finalUrl: string,
  ): Promise<void> {
    const links = extractStaticJavascriptLinks(scriptText, this.deps.config);
    const seed = this.deps.seedForRequest(request);
    const edges: LinkEdge[] = [];
    for (const link of links) {
      const decision =
        this.deps.config.jsDiscovery.enqueueDiscoveredUrls && seed !== null
          ? await this.deps.enqueue(
              link.raw,
              finalUrl,
              "javascript-static",
              request.depth + 1,
              seed,
            )
          : ({
              status: "asset_skipped",
              reason: "JavaScript discovery enqueue disabled",
              requestId: null,
            } satisfies EnqueueDecision);
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
    this.deps.counters.javascriptResourcesParsed += 1;
    this.deps.counters.javascriptLinksExtracted += links.length;
    this.deps.counters.linksExtracted += links.length;
    const hook = this.deps.extensions.hooks.onLinksExtracted;
    if (hook !== undefined) {
      await this.deps.extensionRunner.invoke(
        "onLinksExtracted hook",
        { scope: "request", url: finalUrl, requestId: request.id },
        async () => {
          await hook(this.deps.context(), edges);
        },
      );
    }
  }
}
