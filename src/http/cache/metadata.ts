import type { CachedResponseMetadata } from "./types.js";
import { hasCurrentSchema } from "../../contracts/schema-identity.js";

export function parseCacheMetadata(
  value: unknown,
  expectedUrl: string,
): CachedResponseMetadata {
  if (
    !isRecord(value) ||
    !hasCurrentSchema(value, "site-crawler.httpCache") ||
    Object.keys(value).some(
      (key) =>
        ![
          "schemaId",
          "schemaVersion",
          "url",
          "etag",
          "lastModified",
          "contentType",
          "statusCode",
          "bodyPresent",
          "bodyBytes",
          "storedAt",
        ].includes(key),
    )
  )
    throw new Error("Invalid HTTP cache metadata schema.");
  const url = requiredString(value, "url");
  if (url !== expectedUrl) throw new Error("HTTP cache URL mismatch.");
  const statusCode = requiredInteger(value, "statusCode", 100);
  if (statusCode > 599) throw new Error("Cache statusCode is invalid.");
  const bodyPresent = requiredBoolean(value, "bodyPresent");
  const bodyBytes = requiredInteger(value, "bodyBytes", 0);
  if (!bodyPresent && bodyBytes !== 0) {
    throw new Error("Cache metadata records bytes for an absent body.");
  }
  return {
    schemaId: "site-crawler.httpCache",
    schemaVersion: 1,
    url,
    etag: nullableString(value, "etag"),
    lastModified: nullableString(value, "lastModified"),
    contentType: nullableString(value, "contentType"),
    statusCode,
    bodyPresent,
    bodyBytes,
    storedAt: requiredString(value, "storedAt"),
  };
}

function requiredBoolean(value: Record<string, unknown>, key: string): boolean {
  const item = value[key];
  if (typeof item !== "boolean")
    throw new Error(`Cache field '${key}' is invalid.`);
  return item;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const item = value[key];
  if (typeof item !== "string")
    throw new Error(`Cache field '${key}' is invalid.`);
  return item;
}

function nullableString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const item = value[key];
  if (item === null) return null;
  if (typeof item !== "string")
    throw new Error(`Cache field '${key}' is invalid.`);
  return item;
}

function requiredInteger(
  value: Record<string, unknown>,
  key: string,
  minimum: number,
): number {
  const item = value[key];
  if (typeof item !== "number" || !Number.isSafeInteger(item) || item < minimum)
    throw new Error(`Cache field '${key}' is invalid.`);
  return item;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
