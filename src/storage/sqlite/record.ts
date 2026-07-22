import { makeId } from "../../core/utils.js";
import type { CrawlError } from "../../diagnostics/types.js";
import type { CrawledHtmlPage } from "../../html/types.js";
import type { LinkEdge } from "../../links/types.js";
import type {
  CrawlRequest,
  DiscoveryRecord,
  RequestStateRecord,
} from "../../requests/types.js";
import type { CrawledResource } from "../../resources/types.js";
import type { RobotsRecord } from "../../robots/types.js";
import type { SkippedUrl } from "../../results/types.js";
import type {
  CrawledXmlResource,
  FeedEntry,
  SitemapEntry,
} from "../../xml/types.js";
import type { CrawlRecordKind } from "../types.js";

export interface RecordEnvelope {
  readonly kind: CrawlRecordKind;
  readonly recordId: string;
  readonly requestId: string | null;
  readonly url: string | null;
  readonly statusCode: number | null;
  readonly fromUrl: string | null;
  readonly toUrl: string | null;
  readonly createdAt: string;
  readonly value: unknown;
}

export function requestRecord(value: CrawlRequest): RecordEnvelope {
  return envelope(
    "request",
    value.id,
    value.id,
    value.normalizedUrl,
    value.createdAt,
    value,
  );
}

export function requestStateRecord(value: RequestStateRecord): RecordEnvelope {
  const id = makeId(
    "state",
    `${value.requestId}:${value.state}:${value.updatedAt}`,
  );
  return envelope(
    "request-state",
    id,
    value.requestId,
    null,
    value.updatedAt,
    value,
  );
}

export function discoveryRecord(value: DiscoveryRecord): RecordEnvelope {
  const id = makeId("discovery", JSON.stringify(value));
  return envelope(
    "discovery",
    id,
    value.requestId,
    value.normalizedUrl,
    value.createdAt,
    value,
  );
}

export function resourceRecord(value: CrawledResource): RecordEnvelope {
  return {
    ...envelope(
      "resource",
      value.requestId,
      value.requestId,
      value.finalUrl,
      value.fetchedAt,
      value,
    ),
    statusCode: value.statusCode,
  };
}

export function htmlPageRecord(value: CrawledHtmlPage): RecordEnvelope {
  return envelope(
    "html-page",
    value.requestId,
    value.requestId,
    value.finalUrl,
    value.extractedAt,
    value,
  );
}

export function xmlResourceRecord(value: CrawledXmlResource): RecordEnvelope {
  return envelope(
    "xml-resource",
    value.requestId,
    value.requestId,
    value.finalUrl,
    value.extractedAt,
    value,
  );
}

export function linkRecord(value: LinkEdge): RecordEnvelope {
  return {
    ...envelope(
      "link",
      value.id,
      null,
      value.toNormalized,
      value.discoveredAt,
      value,
    ),
    fromUrl: value.fromUrl,
    toUrl: value.toNormalized,
  };
}

export function skippedRecord(value: SkippedUrl): RecordEnvelope {
  return envelope(
    "skipped",
    makeId("skip", JSON.stringify(value)),
    null,
    value.normalizedUrl,
    value.createdAt,
    value,
  );
}

export function errorRecord(value: CrawlError): RecordEnvelope {
  return envelope(
    "error",
    makeId("error", JSON.stringify(value)),
    value.requestId,
    value.url,
    value.createdAt,
    value,
  );
}

export function robotsRecord(value: RobotsRecord): RecordEnvelope {
  return envelope(
    "robots",
    makeId("robots", `${value.origin}:${value.fetchedAt}`),
    null,
    value.requestedUrl,
    value.fetchedAt,
    value,
  );
}

export function sitemapRecord(value: SitemapEntry): RecordEnvelope {
  return envelope(
    "sitemap-entry",
    makeId("sitemap", JSON.stringify(value)),
    null,
    value.normalizedUrl,
    value.discoveredAt,
    value,
  );
}

export function feedRecord(value: FeedEntry): RecordEnvelope {
  return envelope(
    "feed-entry",
    makeId("feed", JSON.stringify(value)),
    null,
    value.normalizedUrl,
    value.discoveredAt,
    value,
  );
}

function envelope(
  kind: CrawlRecordKind,
  recordId: string,
  requestId: string | null,
  url: string | null,
  createdAt: string,
  value: unknown,
): RecordEnvelope {
  return {
    kind,
    recordId,
    requestId,
    url,
    statusCode: null,
    fromUrl: null,
    toUrl: null,
    createdAt,
    value,
  };
}
