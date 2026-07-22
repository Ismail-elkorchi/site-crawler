import type { StopReason } from "../core/types.js";
import { assertCurrentSchema } from "../contracts/schema-identity.js";
import type { CrawlStats } from "../results/types.js";
import type { LimitReason, StopDetail } from "../runtime/types.js";
import {
  exactRecord,
  nullableString,
  numberField,
  record,
  stringField,
} from "../validation/primitives.js";

export function parseStats(value: unknown): CrawlStats {
  const input = exactRecord(value, "crawl stats", [
    "schemaId",
    "schemaVersion",
    "runId",
    "startedAt",
    "finishedAt",
    "durationMs",
    "seeds",
    "requestsScheduled",
    "requestsAttempted",
    "requestsFetched",
    "requestsTransportFailed",
    "requestsPolicySkipped",
    "requestsCancelled",
    "requestsFailed",
    "urlsSkipped",
    "retries",
    "resourcesRecorded",
    "htmlPagesParsed",
    "xmlResourcesParsed",
    "sitemapsFetched",
    "sitemapEntriesDiscovered",
    "sitemapFilesDiscovered",
    "feedsFetched",
    "feedEntriesDiscovered",
    "linksExtracted",
    "internalLinksExtracted",
    "externalLinksExtracted",
    "javascriptResourcesParsed",
    "javascriptLinksExtracted",
    "cssStylesheetsParsed",
    "cssLinksExtracted",
    "renderedPages",
    "redirectsFollowed",
    "redirectsBlocked",
    "robotsFilesFetched",
    "robotsDisallowedUrls",
    "scopeRejectedUrls",
    "networkSafetyRejectedUrls",
    "parserErrors",
    "decodeErrors",
    "bytesDownloaded",
    "responseCount",
    "responseTimeMsTotal",
    "averageResponseTimeMs",
    "peakConcurrency",
    "peakQueueSize",
    "resumedRequests",
    "recoveredLeases",
    "renewedLeases",
    "releasedLeases",
    "storageBackpressureEvents",
    "droppedEvents",
    "evidenceObjectsWritten",
    "evidenceBytesWritten",
    "changesRecorded",
    "workerHeartbeats",
    "replaysCompleted",
    "stopReason",
    "stopDetail",
  ]);
  assertCurrentSchema(input, "site-crawler.stats", "Resume statistics");
  const number = (key: string): number => numberField(input, key);
  return {
    schemaId: "site-crawler.stats",
    schemaVersion: 1,
    runId: stringField(input, "runId"),
    startedAt: stringField(input, "startedAt"),
    finishedAt: nullableString(input, "finishedAt"),
    durationMs: number("durationMs"),
    seeds: number("seeds"),
    requestsScheduled: number("requestsScheduled"),
    requestsAttempted: number("requestsAttempted"),
    requestsFetched: number("requestsFetched"),
    requestsTransportFailed: number("requestsTransportFailed"),
    requestsPolicySkipped: number("requestsPolicySkipped"),
    requestsCancelled: number("requestsCancelled"),
    requestsFailed: number("requestsFailed"),
    urlsSkipped: number("urlsSkipped"),
    retries: number("retries"),
    resourcesRecorded: number("resourcesRecorded"),
    htmlPagesParsed: number("htmlPagesParsed"),
    xmlResourcesParsed: number("xmlResourcesParsed"),
    sitemapsFetched: number("sitemapsFetched"),
    sitemapEntriesDiscovered: number("sitemapEntriesDiscovered"),
    sitemapFilesDiscovered: number("sitemapFilesDiscovered"),
    feedsFetched: number("feedsFetched"),
    feedEntriesDiscovered: number("feedEntriesDiscovered"),
    linksExtracted: number("linksExtracted"),
    internalLinksExtracted: number("internalLinksExtracted"),
    externalLinksExtracted: number("externalLinksExtracted"),
    javascriptResourcesParsed: number("javascriptResourcesParsed"),
    javascriptLinksExtracted: number("javascriptLinksExtracted"),
    cssStylesheetsParsed: number("cssStylesheetsParsed"),
    cssLinksExtracted: number("cssLinksExtracted"),
    renderedPages: number("renderedPages"),
    redirectsFollowed: number("redirectsFollowed"),
    redirectsBlocked: number("redirectsBlocked"),
    robotsFilesFetched: number("robotsFilesFetched"),
    robotsDisallowedUrls: number("robotsDisallowedUrls"),
    scopeRejectedUrls: number("scopeRejectedUrls"),
    networkSafetyRejectedUrls: number("networkSafetyRejectedUrls"),
    parserErrors: number("parserErrors"),
    decodeErrors: number("decodeErrors"),
    bytesDownloaded: number("bytesDownloaded"),
    responseCount: number("responseCount"),
    responseTimeMsTotal: number("responseTimeMsTotal"),
    averageResponseTimeMs: number("averageResponseTimeMs"),
    peakConcurrency: number("peakConcurrency"),
    peakQueueSize: number("peakQueueSize"),
    resumedRequests: number("resumedRequests"),
    recoveredLeases: number("recoveredLeases"),
    renewedLeases: number("renewedLeases"),
    releasedLeases: number("releasedLeases"),
    storageBackpressureEvents: number("storageBackpressureEvents"),
    droppedEvents: number("droppedEvents"),
    evidenceObjectsWritten: number("evidenceObjectsWritten"),
    evidenceBytesWritten: number("evidenceBytesWritten"),
    changesRecorded: number("changesRecorded"),
    workerHeartbeats: number("workerHeartbeats"),
    replaysCompleted: number("replaysCompleted"),
    stopReason: parseStopReason(input["stopReason"]),
    stopDetail: parseStopDetail(input["stopDetail"]),
  };
}

export function parseStopReason(value: unknown): StopReason | null {
  if (value === null) return null;
  if (value === "frontier_empty") return "frontier_empty";
  if (value === "limit_reached") return "limit_reached";
  if (value === "aborted") return "aborted";
  if (value === "fatal_error") return "fatal_error";
  throw new Error("Resume stop reason is malformed.");
}

export function parseStopDetail(value: unknown): StopDetail | null {
  if (value === null) return null;
  const input = record(value, "stop detail");
  const kind = input["kind"];
  if (kind === "frontier-empty") return { kind };
  if (kind === "cancelled") {
    return { kind, reason: stringField(input, "reason") };
  }
  if (kind === "limit") {
    return { kind, limit: parseLimit(input["limit"]) };
  }
  if (kind === "fatal") {
    throw new Error(
      "Fatal stop detail must be decoded with the manifest error.",
    );
  }
  throw new Error("Resume stop detail is malformed.");
}

function parseLimit(value: unknown): LimitReason {
  switch (value) {
    case "max-scheduled-requests":
    case "max-fetched-resources":
    case "max-run-time":
    case "max-downloaded-bytes":
    case "max-queue-size":
    case "max-sitemap-files":
    case "max-sitemap-entries":
    case "max-rendered-pages":
      return value;
    default:
      throw new Error("Resume limit reason is malformed.");
  }
}
