import type { ConfigFingerprints } from "../config/fingerprint.js";
import { DELIVERY_GUARANTEES } from "../contracts/delivery.js";
import { SITE_CRAWLER_SCHEMA_SET_VERSION } from "../contracts/schema-set.js";
import type { RunStatus } from "../core/types.js";
import { nowIso } from "../core/utils.js";
import type { CrawlError } from "../diagnostics/types.js";
import type { ResolvedSeed } from "../requests/types.js";
import type { RunRuntimeMetadata } from "../results/run-metadata.js";
import type { CrawlStats, RunManifest } from "../results/types.js";
import type { EvidenceStats } from "../storage/types.js";
import type { StopDetail } from "../runtime/types.js";
import type { CrawlCounters } from "./types.js";

export interface CrawlStatsInput {
  readonly runId: string;
  readonly startedAt: string;
  readonly startedMs: number;
  readonly seeds: number;
  readonly counters: CrawlCounters;
  readonly renderedPages: number;
  readonly stopDetail: StopDetail | null;
  readonly evidence: EvidenceStats;
}

export interface RunManifestInput {
  readonly runId: string;
  readonly crawlerVersion: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly status: RunStatus;
  readonly stopDetail: StopDetail | null;
  readonly seeds: readonly ResolvedSeed[];
  readonly outputDirectory: string | null;
  readonly rawSnapshotsEnabled: boolean;
  readonly resumedFrom: string | null;
  readonly fatalError: CrawlError | null;
  readonly stats: CrawlStats;
  readonly fingerprints: ConfigFingerprints;
  readonly runtime: RunRuntimeMetadata;
  readonly sensitive: boolean;
  readonly htmlParserVersion: string | null;
  readonly xmlParserVersion: string | null;
}

export function zeroCounters(): CrawlCounters {
  return {
    requestsScheduled: 0,
    requestsAttempted: 0,
    requestsFetched: 0,
    requestsTransportFailed: 0,
    requestsPolicySkipped: 0,
    requestsCancelled: 0,
    requestsFailed: 0,
    urlsSkipped: 0,
    retries: 0,
    resourcesRecorded: 0,
    htmlPagesParsed: 0,
    xmlResourcesParsed: 0,
    sitemapsFetched: 0,
    sitemapEntriesDiscovered: 0,
    sitemapFilesDiscovered: 0,
    feedsFetched: 0,
    feedEntriesDiscovered: 0,
    linksExtracted: 0,
    internalLinksExtracted: 0,
    externalLinksExtracted: 0,
    javascriptResourcesParsed: 0,
    javascriptLinksExtracted: 0,
    cssStylesheetsParsed: 0,
    cssLinksExtracted: 0,
    storageBackpressureEvents: 0,
    redirectsFollowed: 0,
    redirectsBlocked: 0,
    robotsFilesFetched: 0,
    robotsDisallowedUrls: 0,
    scopeRejectedUrls: 0,
    networkSafetyRejectedUrls: 0,
    parserErrors: 0,
    decodeErrors: 0,
    bytesDownloaded: 0,
    responseCount: 0,
    responseTimeMsTotal: 0,
    peakConcurrency: 0,
    peakQueueSize: 0,
    resumedRequests: 0,
    recoveredLeases: 0,
    renewedLeases: 0,
    releasedLeases: 0,
    droppedEvents: 0,
    changesRecorded: 0,
    workerHeartbeats: 0,
    replaysCompleted: 0,
  };
}

export function createCrawlStats(input: CrawlStatsInput): CrawlStats {
  const counters = input.counters;
  return {
    schemaId: "site-crawler.stats",
    schemaVersion: 1,
    runId: input.runId,
    startedAt: input.startedAt,
    finishedAt: input.stopDetail === null ? null : nowIso(),
    durationMs: performance.now() - input.startedMs,
    seeds: input.seeds,
    requestsScheduled: counters.requestsScheduled,
    requestsAttempted: counters.requestsAttempted,
    requestsFetched: counters.requestsFetched,
    requestsTransportFailed: counters.requestsTransportFailed,
    requestsPolicySkipped: counters.requestsPolicySkipped,
    requestsCancelled: counters.requestsCancelled,
    requestsFailed: counters.requestsFailed,
    urlsSkipped: counters.urlsSkipped,
    retries: counters.retries,
    resourcesRecorded: counters.resourcesRecorded,
    htmlPagesParsed: counters.htmlPagesParsed,
    xmlResourcesParsed: counters.xmlResourcesParsed,
    sitemapsFetched: counters.sitemapsFetched,
    sitemapEntriesDiscovered: counters.sitemapEntriesDiscovered,
    sitemapFilesDiscovered: counters.sitemapFilesDiscovered,
    feedsFetched: counters.feedsFetched,
    feedEntriesDiscovered: counters.feedEntriesDiscovered,
    linksExtracted: counters.linksExtracted,
    internalLinksExtracted: counters.internalLinksExtracted,
    externalLinksExtracted: counters.externalLinksExtracted,
    javascriptResourcesParsed: counters.javascriptResourcesParsed,
    javascriptLinksExtracted: counters.javascriptLinksExtracted,
    cssStylesheetsParsed: counters.cssStylesheetsParsed,
    cssLinksExtracted: counters.cssLinksExtracted,
    renderedPages: input.renderedPages,
    redirectsFollowed: counters.redirectsFollowed,
    redirectsBlocked: counters.redirectsBlocked,
    robotsFilesFetched: counters.robotsFilesFetched,
    robotsDisallowedUrls: counters.robotsDisallowedUrls,
    scopeRejectedUrls: counters.scopeRejectedUrls,
    networkSafetyRejectedUrls: counters.networkSafetyRejectedUrls,
    parserErrors: counters.parserErrors,
    decodeErrors: counters.decodeErrors,
    bytesDownloaded: counters.bytesDownloaded,
    responseCount: counters.responseCount,
    responseTimeMsTotal: counters.responseTimeMsTotal,
    averageResponseTimeMs:
      counters.responseCount === 0
        ? 0
        : counters.responseTimeMsTotal / counters.responseCount,
    peakConcurrency: counters.peakConcurrency,
    peakQueueSize: counters.peakQueueSize,
    resumedRequests: counters.resumedRequests,
    recoveredLeases: counters.recoveredLeases,
    renewedLeases: counters.renewedLeases,
    releasedLeases: counters.releasedLeases,
    storageBackpressureEvents: counters.storageBackpressureEvents,
    droppedEvents: counters.droppedEvents,
    evidenceObjectsWritten: input.evidence.objects,
    evidenceBytesWritten: input.evidence.bytes,
    changesRecorded: counters.changesRecorded,
    workerHeartbeats: counters.workerHeartbeats,
    replaysCompleted: counters.replaysCompleted,
    stopReason: stopReason(input.stopDetail),
    stopDetail: input.stopDetail,
  };
}

export function createRunManifest(input: RunManifestInput): RunManifest {
  return {
    schemaId: "site-crawler.runManifest",
    schemaVersion: 1,
    schemaSetVersion: SITE_CRAWLER_SCHEMA_SET_VERSION,
    runId: input.runId,
    crawlerVersion: input.crawlerVersion,
    htmlParserVersion: input.htmlParserVersion,
    xmlParserVersion: input.xmlParserVersion,
    configFingerprint: input.fingerprints.exact,
    operationalConfigFingerprint: input.fingerprints.operational,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    status: input.status,
    stopReason: stopReason(input.stopDetail),
    stopDetail: input.stopDetail,
    seeds: input.seeds,
    outputDirectory: input.outputDirectory,
    rawSnapshotsEnabled: input.rawSnapshotsEnabled,
    sensitive: input.sensitive,
    runtime: input.runtime,
    deliveryGuarantees: DELIVERY_GUARANTEES,
    resumedFrom: input.resumedFrom,
    fatalError: input.fatalError,
    stats: input.stats,
  };
}

function stopReason(detail: StopDetail | null): RunManifest["stopReason"] {
  if (detail === null || detail.kind === "frontier-empty") {
    return detail === null ? null : "frontier_empty";
  }
  if (detail.kind === "limit") return "limit_reached";
  if (detail.kind === "cancelled") return "aborted";
  return "fatal_error";
}
