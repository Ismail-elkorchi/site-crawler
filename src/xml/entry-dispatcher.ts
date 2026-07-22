import type { CrawlRequest } from "../requests/types.js";
import type { XmlResourceProcessorDependencies } from "./processor-types.js";
import { SitemapRunPolicy } from "./sitemap-run-policy.js";
import type { CrawledXmlResource, FeedEntry, SitemapEntry } from "./types.js";

export class XmlEntryDispatcher {
  private readonly deps: XmlResourceProcessorDependencies;
  private readonly sitemapPolicy: SitemapRunPolicy;

  public constructor(deps: XmlResourceProcessorDependencies) {
    this.deps = deps;
    this.sitemapPolicy = new SitemapRunPolicy({
      config: deps.config,
      counters: deps.counters,
      onLimit: (limit) => deps.onLimit(limit),
    });
  }

  public applyPolicy(xml: CrawledXmlResource): CrawledXmlResource {
    return this.sitemapPolicy.apply(xml);
  }

  public async dispatch(
    xml: CrawledXmlResource,
    request: CrawlRequest,
    finalUrl: string,
  ): Promise<void> {
    await this.handleSitemapEntries(
      xml.xmlKind,
      xml.sitemapEntries,
      request,
      finalUrl,
    );
    await this.handleFeedEntries(xml.feedEntries, request, finalUrl);
  }

  private async handleSitemapEntries(
    xmlKind: CrawledXmlResource["xmlKind"],
    entries: readonly SitemapEntry[],
    request: CrawlRequest,
    finalUrl: string,
  ): Promise<void> {
    const seed = this.deps.seedForRequest(request);
    const canExpandIndex =
      xmlKind !== "sitemap-index" ||
      this.sitemapPolicy.indexExpansionAllowed(request.sitemapIndexDepth);
    const ancestors = [...request.sitemapAncestors, finalUrl];
    for (const original of entries) {
      const recursive =
        xmlKind === "sitemap-index"
          ? this.sitemapPolicy.recursionWarning(
              original,
              finalUrl,
              request.sitemapAncestors,
            )
          : null;
      const entry = recursive ?? original;
      this.deps.counters.sitemapEntriesDiscovered += 1;
      await this.deps.store.writeSitemapEntry(entry);
      if (entry.normalizedUrl === null || seed === null || recursive !== null)
        continue;
      if (xmlKind === "sitemap-index" && canExpandIndex)
        await this.deps.enqueue(
          entry.normalizedUrl,
          finalUrl,
          "sitemap-index",
          request.depth + 1,
          seed,
          request.sitemapIndexDepth + 1,
          ancestors,
        );
      if (xmlKind === "sitemap" && this.deps.config.sitemaps.enqueueEntries)
        await this.deps.enqueue(
          entry.normalizedUrl,
          finalUrl,
          "sitemap",
          1,
          seed,
        );
    }
  }

  private async handleFeedEntries(
    entries: readonly FeedEntry[],
    request: CrawlRequest,
    finalUrl: string,
  ): Promise<void> {
    const seed = this.deps.seedForRequest(request);
    for (const entry of entries) {
      this.deps.counters.feedEntriesDiscovered += 1;
      await this.deps.store.writeFeedEntry(entry);
      if (
        this.deps.config.feeds.enqueueEntries &&
        entry.normalizedUrl !== null &&
        seed !== null
      )
        await this.deps.enqueue(
          entry.normalizedUrl,
          finalUrl,
          "feed",
          request.depth + 1,
          seed,
        );
    }
  }
}
