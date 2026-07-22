import type {
  CrawlRequest,
  CrawlSource,
  RenderPolicy,
  RequestMethod,
} from "./types.js";
import { assertCurrentSchema } from "../contracts/schema-identity.js";
import {
  exactRecord,
  nullableString,
  numberField,
  record,
  stringField,
} from "../validation/primitives.js";

export function parseCrawlRequest(value: unknown): CrawlRequest {
  const request = exactRecord(value, "crawl request", [
    "schemaId",
    "schemaVersion",
    "id",
    "uniqueKey",
    "rawUrl",
    "resolvedUrl",
    "normalizedUrl",
    "referrerUrl",
    "source",
    "seedUrl",
    "seedLabel",
    "depth",
    "sitemapIndexDepth",
    "sitemapAncestors",
    "priority",
    "method",
    "headers",
    "renderPolicy",
    "retryCount",
    "maxRetries",
    "createdAt",
    "updatedAt",
    "userData",
  ]);
  assertCurrentSchema(request, "site-crawler.request", "Crawl request");
  return {
    schemaId: "site-crawler.request",
    schemaVersion: 1,
    id: stringField(request, "id"),
    uniqueKey: stringField(request, "uniqueKey"),
    rawUrl: stringField(request, "rawUrl"),
    resolvedUrl: stringField(request, "resolvedUrl"),
    normalizedUrl: stringField(request, "normalizedUrl"),
    referrerUrl: nullableString(request, "referrerUrl"),
    source: parseSource(request["source"]),
    seedUrl: stringField(request, "seedUrl"),
    seedLabel: nullableString(request, "seedLabel"),
    depth: numberField(request, "depth"),
    sitemapIndexDepth: numberField(request, "sitemapIndexDepth"),
    sitemapAncestors: parseStringArray(
      request["sitemapAncestors"],
      "sitemap ancestors",
    ),
    priority: numberField(request, "priority"),
    method: parseMethod(request["method"]),
    headers: parseStringRecord(request["headers"], "request headers"),
    renderPolicy: parseRenderPolicy(request["renderPolicy"]),
    retryCount: numberField(request, "retryCount"),
    maxRetries: numberField(request, "maxRetries"),
    createdAt: stringField(request, "createdAt"),
    updatedAt: stringField(request, "updatedAt"),
    userData: record(request["userData"], "request userData"),
  };
}

function parseSource(value: unknown): CrawlSource {
  switch (value) {
    case "seed":
    case "html-link":
    case "sitemap":
    case "sitemap-index":
    case "robots-sitemap":
    case "feed":
    case "redirect":
    case "manual":
    case "hook":
    case "javascript-static":
    case "css-static":
      return value;
    default:
      throw new Error("Crawl request source is invalid.");
  }
}

function parseMethod(value: unknown): RequestMethod {
  if (value === "GET" || value === "HEAD") return value;
  throw new Error("Crawl request method is invalid.");
}

function parseRenderPolicy(value: unknown): RenderPolicy {
  if (value === "never" || value === "auto" || value === "always") {
    return value;
  }
  throw new Error("Crawl request render policy is invalid.");
}

function parseStringRecord(
  value: unknown,
  name: string,
): Readonly<Record<string, string>> {
  const input = record(value, name);
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(input)) {
    if (typeof item !== "string") throw new Error(`${name} is malformed.`);
    output[key] = item;
  }
  return output;
}

function parseStringArray(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} is malformed.`);
  }
  return value.slice();
}
