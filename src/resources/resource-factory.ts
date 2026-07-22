import { nowIso } from "../core/utils.js";
import type { PreparedXmlBody } from "../xml/body.js";
import { parseContentLength } from "./content-length.js";
import type { PayloadInspection } from "./resource-inspection.js";
import type { ResourceDecisionInputs } from "./resource-inputs.js";
import type { CrawledResource, ResourceType } from "./types.js";

export function createResource(
  inputs: ResourceDecisionInputs,
  finalUrl: string,
  resourceType: ResourceType,
  contentType: string | null,
  payload: PreparedXmlBody,
  inspection: PayloadInspection,
): CrawledResource {
  const status = inputs.fetchResult.statusCode;
  const fileDecoded =
    payload.wasCompressed && payload.body !== null ? payload.body.size : null;
  return {
    schemaId: "site-crawler.resource",
    schemaVersion: 1,
    runId: inputs.runId,
    requestId: inputs.request.id,
    requestedUrl: inputs.request.normalizedUrl,
    normalizedUrl: inputs.request.normalizedUrl,
    finalUrl,
    statusCode: status,
    ok:
      status !== null &&
      status >= 200 &&
      status < 400 &&
      payload.error === null,
    resourceType,
    contentType,
    contentLength: parseContentLength(
      inputs.fetchResult.headers.get("content-length"),
    ),
    wireBytesRead: inputs.fetchResult.wireBytesRead,
    httpDecodedBytesRead: inputs.fetchResult.decodedBytesRead,
    fileDecodedBytesRead: fileDecoded,
    remoteAddress: inputs.fetchResult.remoteAddress,
    httpProtocol: inputs.fetchResult.protocol,
    networkTimings: inputs.fetchResult.timings,
    tls: inputs.fetchResult.tls,
    cacheStatus: inputs.fetchResult.cacheStatus,
    responseTimeMs: inputs.fetchResult.responseTimeMs,
    fetchedAt: nowIso(),
    redirects: inputs.fetchResult.redirects,
    encoding: inspection.encoding,
    bodyHash: inspection.bodyHash,
    scopeDecision: inputs.scopeDecision,
    robotsDecision: inputs.robotsDecision,
    networkSafetyDecision: inputs.networkSafetyDecision,
    warnings: inspection.warnings,
    error: payload.error,
  };
}
