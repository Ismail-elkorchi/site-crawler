import type { DatabaseSync } from "node:sqlite";
import type { ResourceType } from "../../resources/types.js";
import type { IndexedCrawlRecord } from "../types.js";
import type { DuplicateBodyHashGroup } from "../../query/types.js";
import { parseIndexedRecordRow } from "./query.js";

export function recordsByResourceType(
  database: DatabaseSync,
  resourceType: ResourceType,
  limit: number,
): readonly IndexedCrawlRecord[] {
  return database
    .prepare(
      `SELECT kind, record_id, request_id, url, status_code, from_url, to_url, created_at, json
       FROM crawl_records
       WHERE kind = 'resource' AND json_extract(json, '$.resourceType') = ?
       ORDER BY created_at LIMIT ?`,
    )
    .all(resourceType, boundedLimit(limit))
    .map(parseIndexedRecordRow);
}

export function linksFrom(
  database: DatabaseSync,
  fromUrl: string,
  limit: number,
): readonly IndexedCrawlRecord[] {
  return linkRecords(database, "from_url", fromUrl, limit);
}

export function linksTo(
  database: DatabaseSync,
  toUrl: string,
  limit: number,
): readonly IndexedCrawlRecord[] {
  return linkRecords(database, "to_url", toUrl, limit);
}

export function urlsOnlyIn(
  database: DatabaseSync,
  includedKind: "sitemap-entry" | "html-page",
  excludedKind: "sitemap-entry" | "html-page",
  limit: number,
): readonly string[] {
  return database
    .prepare(
      `SELECT DISTINCT source.url AS url
       FROM crawl_records AS source
       WHERE source.kind = ? AND source.url IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM crawl_records AS excluded
           WHERE excluded.kind = ? AND excluded.url = source.url
         )
       ORDER BY source.url LIMIT ?`,
    )
    .all(includedKind, excludedKind, boundedLimit(limit))
    .map((row) => stringField(row, "url"));
}

export function duplicateHashes(
  database: DatabaseSync,
  limit: number,
): readonly DuplicateBodyHashGroup[] {
  return database
    .prepare(
      `SELECT json_extract(json, '$.bodyHash.decodedSha256') AS hash,
              COUNT(*) AS count,
              json_group_array(url) AS urls
       FROM crawl_records
       WHERE kind = 'resource'
         AND json_extract(json, '$.bodyHash.decodedSha256') IS NOT NULL
       GROUP BY hash HAVING COUNT(*) > 1
       ORDER BY count DESC, hash LIMIT ?`,
    )
    .all(boundedLimit(limit))
    .map(parseDuplicateGroup);
}

function linkRecords(
  database: DatabaseSync,
  column: "from_url" | "to_url",
  value: string,
  limit: number,
): readonly IndexedCrawlRecord[] {
  return database
    .prepare(
      `SELECT kind, record_id, request_id, url, status_code, from_url, to_url, created_at, json
       FROM crawl_records WHERE kind = 'link' AND ${column} = ?
       ORDER BY created_at LIMIT ?`,
    )
    .all(value, boundedLimit(limit))
    .map(parseIndexedRecordRow);
}

function parseDuplicateGroup(value: unknown): DuplicateBodyHashGroup {
  if (!isRecord(value))
    throw new Error("SQLite duplicate-hash row is invalid.");
  const urlsJson = stringField(value, "urls");
  const parsed: unknown = JSON.parse(urlsJson);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === "string")
  ) {
    throw new Error("SQLite duplicate-hash URLs are invalid.");
  }
  return {
    hash: stringField(value, "hash"),
    count: numberField(value, "count"),
    urls: parsed,
  };
}

function boundedLimit(value: number): number {
  return Math.max(1, Math.min(value, 10_000));
}

function stringField(value: unknown, key: string): string {
  if (!isRecord(value) || typeof value[key] !== "string") {
    throw new Error(`SQLite field '${key}' is invalid.`);
  }
  return value[key];
}

function numberField(value: unknown, key: string): number {
  if (!isRecord(value) || typeof value[key] !== "number") {
    throw new Error(`SQLite field '${key}' is invalid.`);
  }
  return value[key];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
