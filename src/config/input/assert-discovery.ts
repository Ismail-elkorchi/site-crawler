import {
  assertBoolean,
  assertInteger,
  assertKnownKeys,
  assertRecord,
  assertString,
  assertStringArray,
  optional,
} from "./assert-utils.js";

export function assertScopeConfig(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "mode",
      "include",
      "exclude",
      "allowedHosts",
      "deniedHosts",
      "maxUrlLength",
      "maxPathSegments",
      "maxQueryParams",
      "maxUrlsPerDirectory",
      "maxUrlsPerPathPattern",
    ],
    name,
  );
  optional(value, "mode", assertScopeMode, name);
  for (const key of ["include", "exclude", "allowedHosts", "deniedHosts"]) {
    optional(value, key, assertStringArray, name);
  }
  for (const key of [
    "maxUrlLength",
    "maxPathSegments",
    "maxQueryParams",
    "maxUrlsPerDirectory",
    "maxUrlsPerPathPattern",
  ]) {
    optional(value, key, assertInteger, name);
  }
}

export function assertLimits(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "maxScheduledRequests",
      "maxFetchedResources",
      "maxDepth",
      "maxRunTimeMs",
      "maxQueueSize",
      "maxDiscoveredLinksPerPage",
      "maxDownloadedBytes",
    ],
    name,
  );
  for (const key of Object.keys(value))
    optional(value, key, assertInteger, name);
}

export function assertRobots(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "enabled",
      "userAgent",
      "productToken",
      "on4xx",
      "on5xx",
      "onNetworkError",
      "respectCrawlDelay",
      "maxBytes",
      "cacheTtlMs",
    ],
    name,
  );
  optional(value, "enabled", assertBoolean, name);
  optional(value, "userAgent", assertString, name);
  optional(value, "productToken", assertString, name);
  optional(value, "on4xx", assertRobotsFallback, name);
  optional(value, "on5xx", assertRobotsFallback, name);
  optional(value, "onNetworkError", assertRobotsFallback, name);
  optional(value, "respectCrawlDelay", assertBoolean, name);
  optional(value, "maxBytes", assertInteger, name);
  optional(value, "cacheTtlMs", assertInteger, name);
}

export function assertSitemaps(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "enabled",
      "discoverFromRobots",
      "probeDefaultSitemap",
      "manual",
      "enqueueEntries",
      "maxSitemapFiles",
      "maxEntriesPerSitemap",
      "maxTotalEntries",
      "maxSitemapIndexDepth",
    ],
    name,
  );
  for (const key of [
    "enabled",
    "discoverFromRobots",
    "probeDefaultSitemap",
    "enqueueEntries",
  ]) {
    optional(value, key, assertBoolean, name);
  }
  optional(value, "manual", assertStringArray, name);
  for (const key of [
    "maxSitemapFiles",
    "maxEntriesPerSitemap",
    "maxTotalEntries",
    "maxSitemapIndexDepth",
  ]) {
    optional(value, key, assertInteger, name);
  }
}

export function assertFeeds(value: unknown, name: string): void {
  assertBooleanObject(value, name, [
    "enabled",
    "discoverFromHtml",
    "enqueueEntries",
  ]);
}

export function assertJavascript(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "enabled",
      "enqueueDiscoveredUrls",
      "fetchScriptAssets",
      "maxScriptBytes",
      "maxUrlsPerScript",
      "mode",
    ],
    name,
  );
  for (const key of ["enabled", "enqueueDiscoveredUrls", "fetchScriptAssets"])
    optional(value, key, assertBoolean, name);
  optional(value, "mode", assertJavascriptMode, name);
  optional(value, "maxScriptBytes", assertInteger, name);
  optional(value, "maxUrlsPerScript", assertInteger, name);
}

function assertBooleanObject(
  value: unknown,
  name: string,
  keys: readonly string[],
): void {
  assertRecord(value, name);
  assertKnownKeys(value, keys, name);
  for (const key of keys) optional(value, key, assertBoolean, name);
}

function assertScopeMode(value: unknown, name: string): void {
  if (
    value !== "origin" &&
    value !== "host" &&
    value !== "domain" &&
    value !== "custom"
  ) {
    throw new TypeError(`${name} is invalid.`);
  }
}

function assertRobotsFallback(value: unknown, name: string): void {
  if (value !== "allow" && value !== "disallow" && value !== "seed-only") {
    throw new TypeError(`${name} is invalid.`);
  }
}

export function assertCss(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "enabled",
      "fetchStylesheets",
      "enqueueDiscoveredUrls",
      "maxStylesheetBytes",
      "maxUrlsPerStylesheet",
    ],
    name,
  );
  for (const key of ["enabled", "fetchStylesheets", "enqueueDiscoveredUrls"])
    optional(value, key, assertBoolean, name);
  optional(value, "maxStylesheetBytes", assertInteger, name);
  optional(value, "maxUrlsPerStylesheet", assertInteger, name);
}

function assertJavascriptMode(value: unknown, name: string): void {
  if (value !== "regex" && value !== "ast" && value !== "hybrid")
    throw new TypeError(`${name} is invalid.`);
}
