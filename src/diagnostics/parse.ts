import type { CrawlError, CrawlErrorCode } from "./types.js";
import { assertCurrentSchema } from "../contracts/schema-identity.js";
import {
  booleanField,
  nullableNumber,
  nullableString,
  record,
  stringField,
} from "../validation/primitives.js";

const unusedCodes: readonly CrawlErrorCode[] = [
  "CONFIG_ERROR",
  "URL_PARSE_ERROR",
  "UNSUPPORTED_PROTOCOL",
  "SCOPE_REJECTED",
  "ROBOTS_DISALLOWED",
  "ROBOTS_FETCH_FAILED",
  "ROBOTS_PARSE_ERROR",
  "NETWORK_SAFETY_REJECTED",
  "DNS_ERROR",
  "TLS_ERROR",
  "FETCH_TIMEOUT",
  "FETCH_ABORTED",
  "FETCH_NETWORK_ERROR",
  "FETCH_DECOMPRESSION_ERROR",
  "UNSUPPORTED_CONTENT_ENCODING",
  "HTTP_ERROR",
  "TOO_MANY_REDIRECTS",
  "REDIRECT_LOOP",
  "REDIRECT_TARGET_REJECTED",
  "RESPONSE_TOO_LARGE",
  "DECOMPRESSED_RESPONSE_TOO_LARGE",
  "UNSUPPORTED_CONTENT_TYPE",
  "DECODE_ERROR",
  "HTML_PARSE_ERROR",
  "HTML_BUDGET_EXCEEDED",
  "XML_PARSE_ERROR",
  "XML_BUDGET_EXCEEDED",
  "SITEMAP_FETCH_FAILED",
  "SITEMAP_PARSE_ERROR",
  "FEED_PARSE_ERROR",
  "RENDER_TIMEOUT",
  "RENDER_ERROR",
  "STORAGE_WRITE_ERROR",
  "FRONTIER_JOURNAL_ERROR",
  "SNAPSHOT_WRITE_ERROR",
  "EXTENSION_ERROR",
  "RESUME_ERROR",
  "INTERNAL_ERROR",
];
void unusedCodes;

export function parseCrawlError(value: unknown): CrawlError | null {
  if (value === null) return null;
  const input = record(value, "crawl error");
  assertCurrentSchema(input, "site-crawler.error", "Crawl error");
  return {
    schemaId: "site-crawler.error",
    schemaVersion: 1,
    code: parseCode(input["code"]),
    message: stringField(input, "message"),
    url: nullableString(input, "url"),
    requestId: nullableString(input, "requestId"),
    retryable: booleanField(input, "retryable"),
    fatal: booleanField(input, "fatal"),
    attempt: nullableNumber(input, "attempt"),
    causeName: nullableString(input, "causeName"),
    causeMessage: nullableString(input, "causeMessage"),
    createdAt: stringField(input, "createdAt"),
  };
}

function parseCode(value: unknown): CrawlErrorCode {
  switch (value) {
    case "CONFIG_ERROR":
    case "URL_PARSE_ERROR":
    case "UNSUPPORTED_PROTOCOL":
    case "SCOPE_REJECTED":
    case "ROBOTS_DISALLOWED":
    case "ROBOTS_FETCH_FAILED":
    case "ROBOTS_PARSE_ERROR":
    case "NETWORK_SAFETY_REJECTED":
    case "DNS_ERROR":
    case "TLS_ERROR":
    case "FETCH_TIMEOUT":
    case "FETCH_ABORTED":
    case "FETCH_NETWORK_ERROR":
    case "FETCH_DECOMPRESSION_ERROR":
    case "UNSUPPORTED_CONTENT_ENCODING":
    case "HTTP_ERROR":
    case "TOO_MANY_REDIRECTS":
    case "REDIRECT_LOOP":
    case "REDIRECT_TARGET_REJECTED":
    case "RESPONSE_TOO_LARGE":
    case "DECOMPRESSED_RESPONSE_TOO_LARGE":
    case "UNSUPPORTED_CONTENT_TYPE":
    case "DECODE_ERROR":
    case "HTML_PARSE_ERROR":
    case "HTML_BUDGET_EXCEEDED":
    case "XML_PARSE_ERROR":
    case "XML_BUDGET_EXCEEDED":
    case "SITEMAP_FETCH_FAILED":
    case "SITEMAP_PARSE_ERROR":
    case "FEED_PARSE_ERROR":
    case "RENDER_TIMEOUT":
    case "RENDER_ERROR":
    case "STORAGE_WRITE_ERROR":
    case "FRONTIER_JOURNAL_ERROR":
    case "SNAPSHOT_WRITE_ERROR":
    case "EXTENSION_ERROR":
    case "RESUME_ERROR":
    case "INTERNAL_ERROR":
      return value;
    default:
      throw new Error("Crawl error code is invalid.");
  }
}
