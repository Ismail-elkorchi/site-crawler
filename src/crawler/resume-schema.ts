import { DELIVERY_GUARANTEES } from "../contracts/delivery.js";
import {
  assertCurrentSchema,
  SITE_CRAWLER_SCHEMA_VERSION,
} from "../contracts/schema-identity.js";
import { SITE_CRAWLER_SCHEMA_SET_VERSION } from "../contracts/schema-set.js";
import { parseCrawlError } from "../diagnostics/parse.js";
import type { RunRuntimeMetadata } from "../results/run-metadata.js";
import type { RunManifest } from "../results/types.js";
import type { StopDetail } from "../runtime/types.js";
import {
  booleanField,
  nullableString,
  exactRecord,
  record,
  stringField,
} from "../validation/primitives.js";
import { parseSeeds } from "./resume-seeds.js";
import {
  parseStats,
  parseStopDetail,
  parseStopReason,
} from "./resume-stats.js";

const MANIFEST_SCHEMA_ID = "site-crawler.runManifest";

export function parseRunManifest(text: string): RunManifest {
  const parsed: unknown = JSON.parse(text);
  const manifest = exactRecord(parsed, "run manifest", [
    "schemaId",
    "schemaVersion",
    "schemaSetVersion",
    "runId",
    "crawlerVersion",
    "htmlParserVersion",
    "xmlParserVersion",
    "configFingerprint",
    "operationalConfigFingerprint",
    "startedAt",
    "finishedAt",
    "status",
    "stopReason",
    "stopDetail",
    "seeds",
    "outputDirectory",
    "rawSnapshotsEnabled",
    "sensitive",
    "runtime",
    "deliveryGuarantees",
    "resumedFrom",
    "fatalError",
    "stats",
  ]);
  assertCurrentSchema(manifest, MANIFEST_SCHEMA_ID, "Resume manifest");
  if (manifest["schemaSetVersion"] !== SITE_CRAWLER_SCHEMA_SET_VERSION) {
    throw new Error("Resume manifest schema set is unsupported.");
  }
  const fatalError = parseCrawlError(manifest["fatalError"]);
  return {
    schemaId: MANIFEST_SCHEMA_ID,
    schemaVersion: SITE_CRAWLER_SCHEMA_VERSION,
    schemaSetVersion: SITE_CRAWLER_SCHEMA_SET_VERSION,
    runId: stringField(manifest, "runId"),
    crawlerVersion: stringField(manifest, "crawlerVersion"),
    htmlParserVersion: nullableString(manifest, "htmlParserVersion"),
    xmlParserVersion: nullableString(manifest, "xmlParserVersion"),
    configFingerprint: stringField(manifest, "configFingerprint"),
    operationalConfigFingerprint: stringField(
      manifest,
      "operationalConfigFingerprint",
    ),
    startedAt: stringField(manifest, "startedAt"),
    finishedAt: nullableString(manifest, "finishedAt"),
    status: parseRunStatus(manifest["status"]),
    stopReason: parseStopReason(manifest["stopReason"]),
    stopDetail: parseManifestStopDetail(manifest["stopDetail"], fatalError),
    seeds: parseSeeds(manifest["seeds"]),
    outputDirectory: nullableString(manifest, "outputDirectory"),
    rawSnapshotsEnabled: booleanField(manifest, "rawSnapshotsEnabled"),
    sensitive: booleanField(manifest, "sensitive"),
    runtime: parseRuntimeMetadata(manifest["runtime"]),
    deliveryGuarantees: DELIVERY_GUARANTEES,
    resumedFrom: nullableString(manifest, "resumedFrom"),
    fatalError,
    stats: parseStats(manifest["stats"]),
  };
}

function parseManifestStopDetail(
  value: unknown,
  fatalError: ReturnType<typeof parseCrawlError>,
): StopDetail | null {
  if (value === null) return null;
  const detail = record(value, "stop detail");
  if (detail["kind"] === "fatal") {
    if (fatalError === null) {
      throw new Error("Fatal stop detail is missing its crawl error.");
    }
    return { kind: "fatal", error: fatalError };
  }
  return parseStopDetail(value);
}

function parseRunStatus(value: unknown): RunManifest["status"] {
  if (
    value === "completed" ||
    value === "partial" ||
    value === "stopped_by_limit" ||
    value === "aborted" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error("Resume run status is malformed.");
}

function parseRuntimeMetadata(value: unknown): RunRuntimeMetadata {
  const input = record(value, "runtime metadata");
  return {
    resultStorage: parseResultStorage(stringField(input, "resultStorage")),
    frontierBackend: parseFrontier(stringField(input, "frontierBackend")),
    frontierOrder: parseFrontierOrder(input["frontierOrder"]),
    httpProtocolPreference: parseProtocol(
      stringField(input, "httpProtocolPreference"),
    ),
    httpCacheEnabled: booleanField(input, "httpCacheEnabled"),
    sessionEnabled: booleanField(input, "sessionEnabled"),
    persistedCookies: booleanField(input, "persistedCookies"),
    renderer: parseRendererMetadata(input["renderer"]),
  };
}

function parseRendererMetadata(value: unknown): RunRuntimeMetadata["renderer"] {
  if (value === null) return null;
  const input = record(value, "renderer metadata");
  return {
    name: stringField(input, "name"),
    version: nullableString(input, "version"),
  };
}

function parseFrontierOrder(
  value: unknown,
): RunRuntimeMetadata["frontierOrder"] {
  if (value === "priority" || value === "bfs" || value === "dfs") return value;
  throw new Error("Resume frontier order metadata is malformed.");
}

function parseResultStorage(
  value: string,
): RunRuntimeMetadata["resultStorage"] {
  if (value === "memory" || value === "filesystem" || value === "sqlite") {
    return value;
  }
  throw new Error("Resume result storage metadata is malformed.");
}

function parseFrontier(value: string): RunRuntimeMetadata["frontierBackend"] {
  if (value === "memory" || value === "journal" || value === "sqlite") {
    return value;
  }
  throw new Error("Resume frontier metadata is malformed.");
}

function parseProtocol(
  value: string,
): RunRuntimeMetadata["httpProtocolPreference"] {
  if (value === "auto" || value === "http1" || value === "http2") return value;
  throw new Error("Resume HTTP protocol metadata is malformed.");
}
