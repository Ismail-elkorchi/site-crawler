import fs from "node:fs";
import path from "node:path";
import type { ConfigFingerprints } from "../config/fingerprint.js";
import type { RunManifest } from "../results/types.js";
import type { ResumePolicy } from "../storage/types.js";
import { parseRunManifest } from "./resume-schema.js";
import type { CrawlCounters } from "./types.js";

export interface ResumeState {
  readonly manifest: RunManifest;
  readonly counters: CrawlCounters;
}

export function readResumeState(
  directory: string,
  fingerprints: ConfigFingerprints,
  policy: ResumePolicy,
): ResumeState {
  const manifest = parseRunManifest(
    fs.readFileSync(path.join(directory, "manifest.json"), "utf8"),
  );
  const expected =
    policy === "exact"
      ? manifest.configFingerprint
      : manifest.operationalConfigFingerprint;
  const actual =
    policy === "exact" ? fingerprints.exact : fingerprints.operational;
  if (expected !== actual) {
    throw new Error(`Resume configuration mismatch under '${policy}' policy.`);
  }
  return { manifest, counters: countersFromStats(manifest.stats) };
}

function countersFromStats(stats: RunManifest["stats"]): CrawlCounters {
  return {
    requestsScheduled: stats.requestsScheduled,
    requestsAttempted: stats.requestsAttempted,
    requestsFetched: stats.requestsFetched,
    requestsTransportFailed: stats.requestsTransportFailed,
    requestsPolicySkipped: stats.requestsPolicySkipped,
    requestsCancelled: stats.requestsCancelled,
    requestsFailed: stats.requestsFailed,
    urlsSkipped: stats.urlsSkipped,
    retries: stats.retries,
    resourcesRecorded: stats.resourcesRecorded,
    htmlPagesParsed: stats.htmlPagesParsed,
    xmlResourcesParsed: stats.xmlResourcesParsed,
    sitemapsFetched: stats.sitemapsFetched,
    sitemapEntriesDiscovered: stats.sitemapEntriesDiscovered,
    sitemapFilesDiscovered: stats.sitemapFilesDiscovered,
    feedsFetched: stats.feedsFetched,
    feedEntriesDiscovered: stats.feedEntriesDiscovered,
    linksExtracted: stats.linksExtracted,
    internalLinksExtracted: stats.internalLinksExtracted,
    externalLinksExtracted: stats.externalLinksExtracted,
    javascriptResourcesParsed: stats.javascriptResourcesParsed,
    javascriptLinksExtracted: stats.javascriptLinksExtracted,
    cssStylesheetsParsed: stats.cssStylesheetsParsed,
    cssLinksExtracted: stats.cssLinksExtracted,
    redirectsFollowed: stats.redirectsFollowed,
    redirectsBlocked: stats.redirectsBlocked,
    robotsFilesFetched: stats.robotsFilesFetched,
    robotsDisallowedUrls: stats.robotsDisallowedUrls,
    scopeRejectedUrls: stats.scopeRejectedUrls,
    networkSafetyRejectedUrls: stats.networkSafetyRejectedUrls,
    parserErrors: stats.parserErrors,
    decodeErrors: stats.decodeErrors,
    bytesDownloaded: stats.bytesDownloaded,
    responseCount: stats.responseCount,
    responseTimeMsTotal: stats.responseTimeMsTotal,
    peakConcurrency: stats.peakConcurrency,
    peakQueueSize: stats.peakQueueSize,
    storageBackpressureEvents: stats.storageBackpressureEvents,
    resumedRequests: stats.resumedRequests,
    recoveredLeases: stats.recoveredLeases,
    renewedLeases: stats.renewedLeases,
    releasedLeases: stats.releasedLeases,
    droppedEvents: stats.droppedEvents,
    changesRecorded: stats.changesRecorded,
    workerHeartbeats: stats.workerHeartbeats,
    replaysCompleted: stats.replaysCompleted,
  };
}
