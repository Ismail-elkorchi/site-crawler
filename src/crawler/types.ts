import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlEvent } from "../events/types.js";
import type { EnqueueDecision } from "../links/types.js";
import type { CrawlSource } from "../requests/types.js";

export interface CrawlCounters {
  requestsScheduled: number;
  requestsAttempted: number;
  requestsFetched: number;
  requestsTransportFailed: number;
  requestsPolicySkipped: number;
  requestsCancelled: number;
  requestsFailed: number;
  urlsSkipped: number;
  retries: number;
  resourcesRecorded: number;
  htmlPagesParsed: number;
  xmlResourcesParsed: number;
  sitemapsFetched: number;
  sitemapEntriesDiscovered: number;
  sitemapFilesDiscovered: number;
  feedsFetched: number;
  feedEntriesDiscovered: number;
  linksExtracted: number;
  internalLinksExtracted: number;
  externalLinksExtracted: number;
  javascriptResourcesParsed: number;
  javascriptLinksExtracted: number;
  cssStylesheetsParsed: number;
  cssLinksExtracted: number;
  redirectsFollowed: number;
  redirectsBlocked: number;
  robotsFilesFetched: number;
  robotsDisallowedUrls: number;
  scopeRejectedUrls: number;
  networkSafetyRejectedUrls: number;
  parserErrors: number;
  decodeErrors: number;
  bytesDownloaded: number;
  responseCount: number;
  responseTimeMsTotal: number;
  peakConcurrency: number;
  peakQueueSize: number;
  resumedRequests: number;
  recoveredLeases: number;
  renewedLeases: number;
  releasedLeases: number;
  storageBackpressureEvents: number;
  droppedEvents: number;
  changesRecorded: number;
  workerHeartbeats: number;
  replaysCompleted: number;
}

export interface CrawlerContext {
  readonly runId: string;
  readonly config: ResolvedCrawlConfig;
  readonly signal: AbortSignal;
  enqueue(
    rawUrl: string,
    referrerUrl: string | null,
    source: CrawlSource,
    depth: number,
  ): Promise<EnqueueDecision>;
  emit(event: CrawlEvent): void;
  abort(reason: string): void;
}

export type RequestOutcome =
  | {
      readonly kind: "fetched";
      readonly statusCode: number | null;
      readonly responseTimeMs: number;
      readonly latencyMs: number;
    }
  | {
      readonly kind: "transport-failed" | "request-failed";
      readonly statusCode: number | null;
      readonly responseTimeMs: number;
      readonly latencyMs: number;
    }
  | {
      readonly kind: "skipped" | "cancelled";
      readonly statusCode: null;
      readonly responseTimeMs: 0;
      readonly latencyMs: 0;
    };
