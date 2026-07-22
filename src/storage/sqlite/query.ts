import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { CrawlRecordQuery, IndexedCrawlRecord } from "../types.js";

export function queryRecords(
  database: DatabaseSync,
  query: CrawlRecordQuery,
): readonly IndexedCrawlRecord[] {
  const clauses: string[] = [];
  const parameters: SQLInputValue[] = [];
  addFilter(clauses, parameters, "kind", query.kind);
  addFilter(clauses, parameters, "request_id", query.requestId);
  addFilter(clauses, parameters, "url", query.url);
  addFilter(clauses, parameters, "status_code", query.statusCode);
  addFilter(clauses, parameters, "from_url", query.fromUrl);
  addFilter(clauses, parameters, "to_url", query.toUrl);
  const where = clauses.length === 0 ? "" : ` WHERE ${clauses.join(" AND ")}`;
  const limit = Math.max(1, Math.min(query.limit ?? 1000, 10000));
  const rows = database
    .prepare(
      `SELECT kind, record_id, request_id, url, status_code, from_url, to_url, created_at, json FROM crawl_records${where} ORDER BY created_at LIMIT ?`,
    )
    .all(...parameters, limit);
  return rows.map(parseIndexedRecordRow);
}

export function countRecords(
  database: DatabaseSync,
  query: CrawlRecordQuery,
): number {
  const clauses: string[] = [];
  const parameters: SQLInputValue[] = [];
  addFilter(clauses, parameters, "kind", query.kind);
  addFilter(clauses, parameters, "request_id", query.requestId);
  addFilter(clauses, parameters, "url", query.url);
  addFilter(clauses, parameters, "status_code", query.statusCode);
  addFilter(clauses, parameters, "from_url", query.fromUrl);
  addFilter(clauses, parameters, "to_url", query.toUrl);
  const where = clauses.length === 0 ? "" : ` WHERE ${clauses.join(" AND ")}`;
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM crawl_records${where}`)
    .get(...parameters);
  if (!isRecord(row) || typeof row["count"] !== "number") {
    throw new Error("SQLite count row is invalid.");
  }
  return row["count"];
}

function addFilter(
  clauses: string[],
  parameters: SQLInputValue[],
  column: string,
  value: SQLInputValue | undefined,
): void {
  if (value === undefined) return;
  clauses.push(`${column} = ?`);
  parameters.push(value);
}

export function parseIndexedRecordRow(value: unknown): IndexedCrawlRecord {
  if (!isRecord(value)) throw new Error("SQLite result row is invalid.");
  const kind = stringField(value, "kind");
  if (!isRecordKind(kind)) throw new Error(`Unknown record kind '${kind}'.`);
  const json = stringField(value, "json");
  return {
    kind,
    recordId: stringField(value, "record_id"),
    requestId: nullableString(value, "request_id"),
    url: nullableString(value, "url"),
    statusCode: nullableNumber(value, "status_code"),
    fromUrl: nullableString(value, "from_url"),
    toUrl: nullableString(value, "to_url"),
    createdAt: stringField(value, "created_at"),
    data: JSON.parse(json),
  };
}

function isRecordKind(value: string): value is IndexedCrawlRecord["kind"] {
  return [
    "request",
    "request-state",
    "discovery",
    "resource",
    "html-page",
    "xml-resource",
    "link",
    "skipped",
    "error",
    "robots",
    "sitemap-entry",
    "feed-entry",
  ].includes(value);
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string")
    throw new Error(`SQLite field '${key}' is invalid.`);
  return field;
}

function nullableString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const field = value[key];
  if (field === null) return null;
  if (typeof field !== "string")
    throw new Error(`SQLite field '${key}' is invalid.`);
  return field;
}

function nullableNumber(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const field = value[key];
  if (field === null) return null;
  if (typeof field !== "number")
    throw new Error(`SQLite field '${key}' is invalid.`);
  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
