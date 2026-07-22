import {
  assertBoolean,
  assertInteger,
  assertKnownKeys,
  assertNullableString,
  assertRecord,
  assertString,
  assertStringArray,
  optional,
} from "./assert-utils.js";

export function assertParsing(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(value, ["html", "xml"], name);
  optional(value, "html", assertHtmlParsing, name);
  optional(value, "xml", assertXmlParsing, name);
}

export function assertRendering(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "mode",
      "maxRenderedPages",
      "navigationTimeoutMs",
      "extractionTimeoutMs",
      "autoRenderMinTextLength",
      "autoRenderWhenNoLinks",
      "autoRenderFrameworkShells",
      "autoRenderUrlPatterns",
      "waitUntil",
    ],
    name,
  );
  optional(value, "mode", assertRenderMode, name);
  for (const key of [
    "maxRenderedPages",
    "navigationTimeoutMs",
    "extractionTimeoutMs",
    "autoRenderMinTextLength",
  ])
    optional(value, key, assertInteger, name);
  optional(value, "autoRenderWhenNoLinks", assertBoolean, name);
  optional(value, "autoRenderFrameworkShells", assertBoolean, name);
  optional(value, "autoRenderUrlPatterns", assertStringArray, name);
  optional(value, "waitUntil", assertWaitUntil, name);
}

export function assertStorage(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "type",
      "frontierBackend",
      "frontierOrder",
      "directory",
      "sqliteFileName",
      "resumeFrom",
      "resumePolicy",
      "durableFrontier",
      "leaseDurationMs",
      "leaseRenewalIntervalMs",
      "lockHeartbeatMs",
      "staleLockMs",
      "storeRawHtml",
      "storeRawXml",
      "writeNdjsonExports",
      "writeBufferSize",
      "fsync",
    ],
    name,
  );
  optional(value, "type", assertStorageType, name);
  optional(value, "frontierBackend", assertFrontierBackend, name);
  optional(value, "frontierOrder", assertFrontierOrder, name);
  optional(value, "directory", assertString, name);
  optional(value, "sqliteFileName", assertString, name);
  optional(value, "resumeFrom", assertNullableString, name);
  optional(value, "resumePolicy", assertResumePolicy, name);
  for (const key of [
    "durableFrontier",
    "storeRawHtml",
    "storeRawXml",
    "writeNdjsonExports",
    "fsync",
  ])
    optional(value, key, assertBoolean, name);
  for (const key of [
    "leaseDurationMs",
    "leaseRenewalIntervalMs",
    "lockHeartbeatMs",
    "staleLockMs",
    "writeBufferSize",
  ])
    optional(value, key, assertInteger, name);
}

export function assertOutput(value: unknown, name: string): void {
  assertRecord(value, name);
  const keys = ["writeSkippedUrls", "writeSummary", "hashBodies"];
  assertKnownKeys(value, keys, name);
  for (const key of keys) optional(value, key, assertBoolean, name);
}

function assertHtmlParsing(value: unknown, name: string): void {
  assertIntegerObject(value, name, [
    "maxInputBytes",
    "maxNodes",
    "maxDepth",
    "maxTextBytes",
  ]);
}

function assertXmlParsing(value: unknown, name: string): void {
  assertIntegerObject(value, name, [
    "maxStreamBytes",
    "maxNodes",
    "maxDepth",
    "maxTextBytes",
  ]);
}

function assertIntegerObject(
  value: unknown,
  name: string,
  keys: readonly string[],
): void {
  assertRecord(value, name);
  assertKnownKeys(value, keys, name);
  for (const key of keys) optional(value, key, assertInteger, name);
}

function assertRenderMode(value: unknown, name: string): void {
  if (value !== "never" && value !== "auto" && value !== "always")
    throw new TypeError(`${name} is invalid.`);
}

function assertWaitUntil(value: unknown, name: string): void {
  if (
    value !== "commit" &&
    value !== "domcontentloaded" &&
    value !== "load" &&
    value !== "networkidle"
  )
    throw new TypeError(`${name} is invalid.`);
}

function assertStorageType(value: unknown, name: string): void {
  if (value !== "memory" && value !== "filesystem" && value !== "sqlite")
    throw new TypeError(`${name} is invalid.`);
}

function assertFrontierBackend(value: unknown, name: string): void {
  if (value !== "memory" && value !== "journal" && value !== "sqlite")
    throw new TypeError(`${name} is invalid.`);
}

function assertFrontierOrder(value: unknown, name: string): void {
  if (value !== "priority" && value !== "bfs" && value !== "dfs")
    throw new TypeError(`${name} is invalid.`);
}

function assertResumePolicy(value: unknown, name: string): void {
  if (value !== "exact" && value !== "operational")
    throw new TypeError(`${name} is invalid.`);
}
