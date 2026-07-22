import {
  assertBoolean,
  assertFiniteNumber,
  assertInteger,
  assertKnownKeys,
  assertNullableInteger,
  assertRecord,
  assertStringRecord,
  optional,
} from "./assert-utils.js";

export function assertNetworkSafety(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "enabled",
      "allowPrivateNetworks",
      "allowLocalhost",
      "mixedAddressPolicy",
      "dnsTimeoutMs",
      "dnsCacheTtlMs",
    ],
    name,
  );
  for (const key of ["enabled", "allowPrivateNetworks", "allowLocalhost"])
    optional(value, key, assertBoolean, name);
  optional(value, "mixedAddressPolicy", assertMixedPolicy, name);
  optional(value, "dnsTimeoutMs", assertInteger, name);
  optional(value, "dnsCacheTtlMs", assertInteger, name);
}

export function assertNetwork(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "maxConcurrency",
      "maxConcurrencyPerOrigin",
      "requestTimeoutMs",
      "connectTimeoutMs",
      "firstByteTimeoutMs",
      "maxRedirects",
      "retries",
      "retryBackoffMs",
      "respectRetryAfter",
      "minDelayMsPerOrigin",
      "maxRequestsPerMinutePerOrigin",
      "protocolPreference",
      "rejectUnauthorized",
      "autoThrottle",
      "headers",
    ],
    name,
  );
  for (const key of [
    "maxConcurrency",
    "maxConcurrencyPerOrigin",
    "requestTimeoutMs",
    "connectTimeoutMs",
    "firstByteTimeoutMs",
    "maxRedirects",
    "retries",
    "retryBackoffMs",
    "minDelayMsPerOrigin",
  ])
    optional(value, key, assertInteger, name);
  optional(value, "respectRetryAfter", assertBoolean, name);
  optional(value, "maxRequestsPerMinutePerOrigin", assertNullableInteger, name);
  optional(value, "protocolPreference", assertProtocolPreference, name);
  optional(value, "rejectUnauthorized", assertBoolean, name);
  optional(value, "autoThrottle", assertAutoThrottle, name);
  optional(value, "headers", assertStringRecord, name);
}

export function assertResponseLimits(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "maxCompressedBytes",
      "maxDecompressedBytes",
      "memoryThresholdBytes",
      "spoolDirectory",
    ],
    name,
  );
  optional(value, "maxCompressedBytes", assertInteger, name);
  optional(value, "maxDecompressedBytes", assertInteger, name);
  optional(value, "memoryThresholdBytes", assertInteger, name);
  const spool = value["spoolDirectory"];
  if (spool !== undefined && spool !== null && typeof spool !== "string") {
    throw new TypeError(`${name}.spoolDirectory must be a string or null.`);
  }
}

function assertAutoThrottle(value: unknown, name: string): void {
  assertRecord(value, name);
  assertKnownKeys(
    value,
    [
      "enabled",
      "targetConcurrencyPerOrigin",
      "startDelayMs",
      "minDelayMs",
      "maxDelayMs",
      "smoothing",
    ],
    name,
  );
  optional(value, "enabled", assertBoolean, name);
  for (const key of [
    "targetConcurrencyPerOrigin",
    "startDelayMs",
    "minDelayMs",
    "maxDelayMs",
  ])
    optional(value, key, assertInteger, name);
  optional(value, "smoothing", assertFiniteNumber, name);
}

function assertMixedPolicy(value: unknown, name: string): void {
  if (value !== "reject-host" && value !== "use-safe-addresses-only") {
    throw new TypeError(`${name} is invalid.`);
  }
}

function assertProtocolPreference(value: unknown, name: string): void {
  if (value !== "auto" && value !== "http1" && value !== "http2") {
    throw new TypeError(`${name} is invalid.`);
  }
}
