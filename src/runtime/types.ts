import type { CrawlError } from "../diagnostics/types.js";

export type RunPhase =
  | "created"
  | "initializing"
  | "running"
  | "stopping"
  | "draining"
  | "finalizing"
  | "closed";

export type LimitReason =
  | "max-scheduled-requests"
  | "max-fetched-resources"
  | "max-run-time"
  | "max-downloaded-bytes"
  | "max-queue-size"
  | "max-sitemap-files"
  | "max-sitemap-entries"
  | "max-sitemap-index-depth"
  | "max-rendered-pages";

export type StopDetail =
  | { readonly kind: "frontier-empty" }
  | { readonly kind: "limit"; readonly limit: LimitReason }
  | { readonly kind: "cancelled"; readonly reason: string }
  | { readonly kind: "fatal"; readonly error: CrawlError };

export interface RunSnapshot {
  readonly phase: RunPhase;
  readonly stopDetail: StopDetail | null;
  readonly activeRequests: number;
}
