import { nowIso } from "../core/utils.js";
import type { EvidenceReference } from "../evidence/types.js";
import type { CrawlRequest, ResolvedSeed } from "../requests/types.js";
import { enqueueFeedAlternates } from "./feed-discovery.js";
import { HtmlLinkProcessor } from "./link-decider.js";
import { createHtmlPage } from "./page-record.js";
import type { HtmlResourceProcessorDependencies } from "./processor-types.js";
import type { CrawledHtmlPage, HtmlExtractionResult } from "./types.js";

export class HtmlPagePersister {
  private readonly links: HtmlLinkProcessor;
  private readonly deps: HtmlResourceProcessorDependencies;

  public constructor(deps: HtmlResourceProcessorDependencies) {
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

  public async persist(
    extraction: HtmlExtractionResult,
    evidence: EvidenceReference | null,
    request: CrawlRequest,
    resourceId: string,
    finalUrl: string,
    htmlSource: CrawledHtmlPage["htmlSource"],
  ): Promise<void> {
    const seed = this.deps.seedForRequest(request);
    const linkResult = await this.links.processLinks(
      extraction.links,
      finalUrl,
      request,
      seed,
    );
    const page = createHtmlPage({
      runId: this.deps.runId,
      extraction,
      links: linkResult,
      request,
      resourceId,
      finalUrl,
      htmlSource,
      evidence,
    });
    this.recordPage(page, linkResult);
    await this.deps.store.writeHtmlPage(page);
    await this.invokeParsedHook(page, request, finalUrl);
    this.deps.emit({
      type: "links-extracted",
      runId: this.deps.runId,
      requestId: request.id,
      count: linkResult.edges.length,
      createdAt: nowIso(),
    });
    await this.invokeLinksHook(linkResult.edges, request, finalUrl);
    await this.discoverFeeds(page, request, finalUrl, seed);
  }

  private recordPage(
    page: CrawledHtmlPage,
    links: Awaited<ReturnType<HtmlLinkProcessor["processLinks"]>>,
  ): void {
    this.deps.counters.htmlPagesParsed += 1;
    this.deps.counters.linksExtracted += links.edges.length;
    this.deps.counters.internalLinksExtracted += links.inScopeOutgoing;
    this.deps.counters.externalLinksExtracted += links.outOfScopeOutgoing;
    this.deps.counters.parserErrors += page.facts.parserDiagnostics.filter(
      (diagnostic) => diagnostic.level === "error",
    ).length;
  }

  private async invokeParsedHook(
    page: CrawledHtmlPage,
    request: CrawlRequest,
    finalUrl: string,
  ): Promise<void> {
    const hook = this.deps.extensions.hooks.onHtmlParsed;
    if (hook === undefined) return;
    await this.deps.extensionRunner.invoke(
      "onHtmlParsed hook",
      { scope: "request", url: finalUrl, requestId: request.id },
      async () => {
        await hook(this.deps.context(), page);
      },
    );
  }

  private async invokeLinksHook(
    edges: Awaited<ReturnType<HtmlLinkProcessor["processLinks"]>>["edges"],
    request: CrawlRequest,
    finalUrl: string,
  ): Promise<void> {
    const hook = this.deps.extensions.hooks.onLinksExtracted;
    if (hook === undefined) return;
    await this.deps.extensionRunner.invoke(
      "onLinksExtracted hook",
      { scope: "request", url: finalUrl, requestId: request.id },
      async () => {
        await hook(this.deps.context(), edges);
      },
    );
  }

  private async discoverFeeds(
    page: CrawledHtmlPage,
    request: CrawlRequest,
    finalUrl: string,
    seed: ResolvedSeed | null,
  ): Promise<void> {
    if (
      !this.deps.config.feeds.enabled ||
      !this.deps.config.feeds.discoverFromHtml
    )
      return;
    await enqueueFeedAlternates(
      {
        enqueue: async (rawUrl, referrerUrl, source, depth, resolvedSeed) =>
          await this.deps.enqueue(
            rawUrl,
            referrerUrl,
            source,
            depth,
            resolvedSeed,
          ),
      },
      page,
      finalUrl,
      request.depth + 1,
      seed,
    );
  }
}
