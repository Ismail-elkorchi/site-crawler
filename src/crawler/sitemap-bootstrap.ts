import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlSource, ResolvedSeed } from "../requests/types.js";
import type { RobotsService } from "../robots/index.js";

export interface SitemapBootstrapDependencies {
  readonly config: ResolvedCrawlConfig;
  readonly robots: RobotsService;
  enqueue(
    rawUrl: string,
    referrerUrl: string | null,
    source: CrawlSource,
    depth: number,
    seed: ResolvedSeed | null,
  ): Promise<unknown>;
}

export class SitemapBootstrap {
  private readonly deps: SitemapBootstrapDependencies;

  public constructor(deps: SitemapBootstrapDependencies) {
    this.deps = deps;
  }

  public async run(): Promise<void> {
    if (!this.deps.config.sitemaps.enabled) return;
    for (const seed of this.deps.config.seeds) {
      const sitemapUrls = await this.urlsForSeed(seed);
      let count = 0;
      for (const sitemapUrl of sitemapUrls) {
        if (count >= this.deps.config.sitemaps.maxSitemapFiles) break;
        count += 1;
        await this.deps.enqueue(sitemapUrl, null, "robots-sitemap", 0, seed);
      }
    }
  }

  private async urlsForSeed(seed: ResolvedSeed): Promise<ReadonlySet<string>> {
    const urls = new Set<string>();
    if (this.deps.config.sitemaps.discoverFromRobots) {
      for (const url of await this.deps.robots.sitemapUrlsFor(
        seed.normalizedUrl,
      )) {
        urls.add(url);
      }
    }
    if (this.deps.config.sitemaps.probeDefaultSitemap) {
      urls.add(`${new URL(seed.normalizedUrl).origin}/sitemap.xml`);
    }
    for (const manual of this.deps.config.sitemaps.manual) urls.add(manual);
    return urls;
  }
}
