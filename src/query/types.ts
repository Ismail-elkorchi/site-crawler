import type { IndexedCrawlRecord } from "../storage/types.js";

export interface CrawlIndexOptions {
  readonly sqliteFileName?: string;
}

export interface DuplicateBodyHashGroup {
  readonly hash: string;
  readonly count: number;
  readonly urls: readonly string[];
}

export interface CrawlIndexReader {
  query(
    query: import("../storage/types.js").CrawlRecordQuery,
  ): readonly IndexedCrawlRecord[];
  count(query?: import("../storage/types.js").CrawlRecordQuery): number;
  metadata(key: "manifest" | "config" | "stats" | "summary"): unknown | null;
  resourcesByType(
    resourceType: import("../resources/types.js").ResourceType,
    limit?: number,
  ): readonly IndexedCrawlRecord[];
  outgoingLinks(fromUrl: string, limit?: number): readonly IndexedCrawlRecord[];
  incomingLinks(toUrl: string, limit?: number): readonly IndexedCrawlRecord[];
  sitemapOnlyUrls(limit?: number): readonly string[];
  htmlOnlyUrls(limit?: number): readonly string[];
  duplicateBodyHashes(limit?: number): readonly DuplicateBodyHashGroup[];
  close(): void;
}
