import type { ResolvedCrawlConfig } from "../config/types.js";
import { warning } from "../diagnostics/factory.js";
import type { LimitReason } from "../runtime/types.js";
import type { CrawlCounters } from "../crawler/types.js";
import type { CrawledXmlResource, SitemapEntry } from "./types.js";

export interface SitemapRunPolicyDependencies {
  readonly config: ResolvedCrawlConfig;
  readonly counters: CrawlCounters;
  onLimit(limit: LimitReason): void;
}

export class SitemapRunPolicy {
  private readonly deps: SitemapRunPolicyDependencies;

  public constructor(deps: SitemapRunPolicyDependencies) {
    this.deps = deps;
  }

  public apply(resource: CrawledXmlResource): CrawledXmlResource {
    if (
      resource.xmlKind !== "sitemap" &&
      resource.xmlKind !== "sitemap-index"
    ) {
      return resource;
    }
    const remaining = Math.max(
      0,
      this.deps.config.sitemaps.maxTotalEntries -
        this.deps.counters.sitemapEntriesDiscovered,
    );
    if (resource.sitemapEntries.length <= remaining) return resource;
    this.deps.onLimit("max-sitemap-entries");
    return {
      ...resource,
      sitemapEntries: resource.sitemapEntries.slice(0, remaining),
      warnings: [
        ...resource.warnings,
        warning(
          "SITEMAP_WARNING",
          "Sitemap entries were truncated by the run-wide entry limit",
          `${resource.sitemapEntries.length - remaining} entries were not processed`,
        ),
      ],
    };
  }

  public indexExpansionAllowed(requestDepth: number): boolean {
    if (requestDepth < this.deps.config.sitemaps.maxSitemapIndexDepth) {
      return true;
    }
    this.deps.onLimit("max-sitemap-index-depth");
    return false;
  }

  public recursionWarning(
    entry: SitemapEntry,
    finalUrl: string,
    ancestors: readonly string[],
  ): SitemapEntry | null {
    const target = entry.normalizedUrl;
    if (target === null) return null;
    if (target !== finalUrl && !ancestors.includes(target)) return null;
    return {
      ...entry,
      warnings: [
        ...entry.warnings,
        warning(
          "SITEMAP_WARNING",
          "Recursive sitemap index reference was not enqueued",
          target,
        ),
      ],
    };
  }
}
