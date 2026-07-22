import type { EnqueueDecision } from "../links/types.js";
export type RenderPolicy = "never" | "auto" | "always";
export type RequestMethod = "GET" | "HEAD";
export type TerminalRequestState =
  "handled" | "failed" | "skipped" | "cancelled";
export type RequestState =
  | "pending"
  | "in_progress"
  | "handled"
  | "failed"
  | "skipped"
  | "retrying"
  | "cancelled";
export type CrawlSource =
  | "seed"
  | "html-link"
  | "sitemap"
  | "sitemap-index"
  | "robots-sitemap"
  | "feed"
  | "redirect"
  | "manual"
  | "hook"
  | "javascript-static"
  | "css-static";
export interface SeedInputConfig {
  readonly url: string;
  readonly scope?: import("../url/types.js").PartialScopeConfig;
  readonly maxDepth?: number;
  readonly maxScheduledRequests?: number;
  readonly label?: string;
}
export type CrawlSeedInput = string | SeedInputConfig;
export interface ResolvedSeed {
  readonly url: string;
  readonly normalizedUrl: string;
  readonly scope: import("../url/types.js").ScopeConfig;
  readonly maxDepth: number | null;
  readonly maxScheduledRequests: number | null;
  readonly label: string | null;
}
export interface CrawlRequest {
  readonly schemaId: "site-crawler.request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly uniqueKey: string;
  readonly rawUrl: string;
  readonly resolvedUrl: string;
  readonly normalizedUrl: string;
  readonly referrerUrl: string | null;
  readonly source: CrawlSource;
  readonly seedUrl: string;
  readonly seedLabel: string | null;
  readonly depth: number;
  readonly sitemapIndexDepth: number;
  readonly sitemapAncestors: readonly string[];
  readonly priority: number;
  readonly method: RequestMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly renderPolicy: RenderPolicy;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly userData: Readonly<Record<string, unknown>>;
}
export interface DiscoveryRecord {
  readonly schemaId: "site-crawler.discovery";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly uniqueKey: string;
  readonly requestId: string | null;
  readonly rawUrl: string;
  readonly resolvedUrl: string | null;
  readonly normalizedUrl: string | null;
  readonly referrerUrl: string | null;
  readonly source: CrawlSource;
  readonly seedUrl: string;
  readonly seedLabel: string | null;
  readonly depth: number;
  readonly firstSeen: boolean;
  readonly decision: EnqueueDecision;
  readonly createdAt: string;
}
export interface RequestStateRecord {
  readonly schemaId: "site-crawler.requestState";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly requestId: string;
  readonly uniqueKey: string;
  readonly state: RequestState;
  readonly reason: string | null;
  readonly updatedAt: string;
}
