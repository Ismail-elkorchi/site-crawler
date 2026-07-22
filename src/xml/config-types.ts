export interface SitemapConfig {
  readonly enabled: boolean;
  readonly discoverFromRobots: boolean;
  readonly probeDefaultSitemap: boolean;
  readonly manual: readonly string[];
  readonly enqueueEntries: boolean;
  readonly maxSitemapFiles: number;
  readonly maxEntriesPerSitemap: number;
  readonly maxTotalEntries: number;
  readonly maxSitemapIndexDepth: number;
}

export interface FeedConfig {
  readonly enabled: boolean;
  readonly discoverFromHtml: boolean;
  readonly enqueueEntries: boolean;
}

export interface XmlParsingConfig {
  readonly maxStreamBytes: number;
  readonly maxNodes: number;
  readonly maxDepth: number;
  readonly maxTextBytes: number;
}
