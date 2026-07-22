import type { DeliveryGuarantees } from "../contracts/delivery.js";
import type { SiteCrawlerSchemaSetVersion } from "../contracts/schema-set.js";
import type { RunStatus, StopReason } from "../core/types.js";
import type { CrawlError, SkipReason } from "../diagnostics/types.js";
import type { ResolvedSeed } from "../requests/types.js";
import type { StopDetail } from "../runtime/types.js";
import type { RunRuntimeMetadata } from "./run-metadata.js";

export interface SkippedUrl {
  readonly schemaId: "site-crawler.skippedUrl";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly rawUrl: string;
  readonly resolvedUrl: string | null;
  readonly normalizedUrl: string | null;
  readonly referrerUrl: string | null;
  readonly reason: SkipReason;
  readonly policyName: string | null;
  readonly detail: string | null;
  readonly createdAt: string;
}

export interface CrawlStats {
  readonly schemaId: "site-crawler.stats";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number;
  readonly seeds: number;
  readonly requestsScheduled: number;
  readonly requestsAttempted: number;
  readonly requestsFetched: number;
  readonly requestsTransportFailed: number;
  readonly requestsPolicySkipped: number;
  readonly requestsCancelled: number;
  readonly requestsFailed: number;
  readonly urlsSkipped: number;
  readonly retries: number;
  readonly resourcesRecorded: number;
  readonly htmlPagesParsed: number;
  readonly xmlResourcesParsed: number;
  readonly sitemapsFetched: number;
  readonly sitemapEntriesDiscovered: number;
  readonly sitemapFilesDiscovered: number;
  readonly feedsFetched: number;
  readonly feedEntriesDiscovered: number;
  readonly linksExtracted: number;
  readonly internalLinksExtracted: number;
  readonly externalLinksExtracted: number;
  readonly javascriptResourcesParsed: number;
  readonly javascriptLinksExtracted: number;
  readonly cssStylesheetsParsed: number;
  readonly cssLinksExtracted: number;
  readonly renderedPages: number;
  readonly redirectsFollowed: number;
  readonly redirectsBlocked: number;
  readonly robotsFilesFetched: number;
  readonly robotsDisallowedUrls: number;
  readonly scopeRejectedUrls: number;
  readonly networkSafetyRejectedUrls: number;
  readonly parserErrors: number;
  readonly decodeErrors: number;
  readonly bytesDownloaded: number;
  readonly responseCount: number;
  readonly responseTimeMsTotal: number;
  readonly averageResponseTimeMs: number;
  readonly peakConcurrency: number;
  readonly peakQueueSize: number;
  readonly resumedRequests: number;
  readonly recoveredLeases: number;
  readonly renewedLeases: number;
  readonly releasedLeases: number;
  readonly storageBackpressureEvents: number;
  readonly droppedEvents: number;
  readonly evidenceObjectsWritten: number;
  readonly evidenceBytesWritten: number;
  readonly changesRecorded: number;
  readonly workerHeartbeats: number;
  readonly replaysCompleted: number;
  readonly stopReason: StopReason | null;
  readonly stopDetail: StopDetail | null;
}

export interface RunManifest {
  readonly schemaId: "site-crawler.runManifest";
  readonly schemaVersion: 1;
  readonly schemaSetVersion: SiteCrawlerSchemaSetVersion;
  readonly runId: string;
  readonly crawlerVersion: string;
  readonly htmlParserVersion: string | null;
  readonly xmlParserVersion: string | null;
  readonly configFingerprint: string;
  readonly operationalConfigFingerprint: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly status: RunStatus;
  readonly stopReason: StopReason | null;
  readonly stopDetail: StopDetail | null;
  readonly seeds: readonly ResolvedSeed[];
  readonly outputDirectory: string | null;
  readonly rawSnapshotsEnabled: boolean;
  readonly sensitive: boolean;
  readonly runtime: RunRuntimeMetadata;
  readonly deliveryGuarantees: DeliveryGuarantees;
  readonly resumedFrom: string | null;
  readonly fatalError: CrawlError | null;
  readonly stats: CrawlStats;
}

export interface CrawlResult {
  readonly schemaId: "site-crawler.result";
  readonly schemaVersion: 1;
  readonly schemaSetVersion: SiteCrawlerSchemaSetVersion;
  readonly runId: string;
  readonly status: RunStatus;
  readonly stopReason: StopReason | null;
  readonly stopDetail: StopDetail | null;
  readonly outputDirectory: string | null;
  readonly manifestPath: string | null;
  readonly stats: CrawlStats;
  readonly fatalError: CrawlError | null;
}
