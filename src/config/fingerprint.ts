import { sha256 } from "../core/utils.js";
import type { ResolvedCrawlConfig } from "./types.js";
export interface ConfigFingerprints {
  readonly exact: string;
  readonly operational: string;
}
export function createConfigFingerprints(
  config: ResolvedCrawlConfig,
): ConfigFingerprints {
  return {
    exact: sha256(stableStringify(config)),
    operational: sha256(stableStringify(operationalProjection(config))),
  };
}
function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
function operationalProjection(config: ResolvedCrawlConfig): unknown {
  return {
    ...config,
    network: {
      ...config.network,
      maxConcurrency: 0,
      maxConcurrencyPerOrigin: 0,
      minDelayMsPerOrigin: 0,
      maxRequestsPerMinutePerOrigin: null,
      autoThrottle: {
        enabled: false,
        targetConcurrencyPerOrigin: 0,
        startDelayMs: 0,
        minDelayMs: 0,
        maxDelayMs: 0,
        smoothing: 0,
      },
    },
    session: {
      ...config.session,
      persistCookies: false,
      cookieFile: null,
    },
    httpCache: {
      ...config.httpCache,
      directory: "",
    },
    responseLimits: {
      ...config.responseLimits,
      memoryThresholdBytes: 0,
      spoolDirectory: null,
    },
    storage: {
      ...config.storage,
      directory: "",
      resumeFrom: null,
      resumePolicy: "operational",
      leaseDurationMs: 0,
      leaseRenewalIntervalMs: 0,
      lockHeartbeatMs: 0,
      staleLockMs: 0,
      storeRawHtml: false,
      storeRawXml: false,
      writeNdjsonExports: false,
      writeBufferSize: 0,
      fsync: false,
    },
    output: {
      ...config.output,
      writeSkippedUrls: false,
      writeSummary: false,
    },
  };
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  const output: Record<string, unknown> = {};
  const record = toRecord(value);
  const keys = Object.keys(record).sort();
  for (const key of keys) output[key] = canonicalize(record[key]);
  return output;
}
function toRecord(value: object): Readonly<Record<string, unknown>> {
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value)) output[key] = Reflect.get(value, key);
  return output;
}
