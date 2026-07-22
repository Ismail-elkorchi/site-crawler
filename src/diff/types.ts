export type CrawlChangeKind =
  | "appeared"
  | "disappeared"
  | "status-changed"
  | "redirect-changed"
  | "content-type-changed"
  | "body-changed"
  | "title-changed"
  | "canonical-changed"
  | "meta-description-changed"
  | "headings-changed"
  | "text-changed"
  | "link-added"
  | "link-removed"
  | "sitemap-added"
  | "sitemap-removed"
  | "robots-changed";

export type CrawlChangeEntity =
  "resource" | "html-page" | "link" | "sitemap" | "robots";

export interface CrawlChange {
  readonly schemaId: "site-crawler.change";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly entity: CrawlChangeEntity;
  readonly kind: CrawlChangeKind;
  readonly key: string;
  readonly before: unknown | null;
  readonly after: unknown | null;
  readonly detectedAt: string;
}

export interface CrawlDiffSummary {
  readonly appeared: number;
  readonly disappeared: number;
  readonly modified: number;
  readonly linksAdded: number;
  readonly linksRemoved: number;
  readonly sitemapAdded: number;
  readonly sitemapRemoved: number;
}

export interface CrawlDiffReport {
  readonly schemaId: "site-crawler.diffReport";
  readonly schemaVersion: 1;
  readonly baseRunDirectory: string;
  readonly targetRunDirectory: string;
  readonly createdAt: string;
  readonly summary: CrawlDiffSummary;
  readonly changes: readonly CrawlChange[];
}
