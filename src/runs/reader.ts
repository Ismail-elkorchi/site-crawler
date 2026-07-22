import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { DatabaseSync } from "node:sqlite";
import type { CrawlRecordKind } from "../storage/types.js";
import type { RunReader, RunRecord } from "./types.js";

export async function openRunReader(runDirectory: string): Promise<RunReader> {
  const directory = path.resolve(runDirectory);
  const databasePath = path.join(directory, "crawl.sqlite");
  if (await exists(databasePath))
    return new SqliteRunReader(directory, databasePath);
  return new NdjsonRunReader(directory);
}

class SqliteRunReader implements RunReader {
  private readonly directory: string;
  private readonly database: DatabaseSync;

  public constructor(directory: string, databasePath: string) {
    this.directory = directory;
    this.database = new DatabaseSync(databasePath, { readOnly: true });
    this.database.exec("PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;");
  }

  public async metadata(
    key: "manifest" | "config" | "stats" | "summary",
  ): Promise<unknown | null> {
    const row = this.database
      .prepare("SELECT json FROM crawl_metadata WHERE key = ?")
      .get(key);
    if (!isRecord(row) || typeof row["json"] !== "string") {
      return await metadataFile(this.directory, key);
    }
    return JSON.parse(row["json"]);
  }

  public async *records(kind: CrawlRecordKind): AsyncIterable<RunRecord> {
    const rows = this.database
      .prepare(
        "SELECT record_id, json FROM crawl_records WHERE kind = ? ORDER BY created_at, record_id",
      )
      .iterate(kind);
    for (const row of rows) {
      if (!isRecord(row)) continue;
      const recordId = row["record_id"];
      const json = row["json"];
      if (typeof recordId !== "string" || typeof json !== "string") continue;
      yield { kind, recordId, data: JSON.parse(json) };
    }
  }

  public async close(): Promise<void> {
    this.database.close();
  }
}

class NdjsonRunReader implements RunReader {
  private readonly directory: string;

  public constructor(directory: string) {
    this.directory = directory;
  }

  public async metadata(
    key: "manifest" | "config" | "stats" | "summary",
  ): Promise<unknown | null> {
    return await metadataFile(this.directory, key);
  }

  public async *records(kind: CrawlRecordKind): AsyncIterable<RunRecord> {
    const fileName = fileForKind(kind);
    if (fileName === null) return;
    const target = path.join(this.directory, fileName);
    if (!(await exists(target))) return;
    const stream = createReadStream(target, { encoding: "utf8" });
    const lines = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });
    let index = 0;
    for await (const line of lines) {
      if (line.trim().length === 0) continue;
      index += 1;
      yield { kind, recordId: `${kind}:${index}`, data: JSON.parse(line) };
    }
  }

  public async close(): Promise<void> {
    return;
  }
}

function fileForKind(kind: CrawlRecordKind): string | null {
  const files: Readonly<Record<CrawlRecordKind, string>> = {
    request: "requests.ndjson",
    "request-state": "request-states.ndjson",
    discovery: "discoveries.ndjson",
    resource: "resources.ndjson",
    "html-page": "pages.ndjson",
    "xml-resource": "xml.ndjson",
    link: "links.ndjson",
    skipped: "skipped.ndjson",
    error: "errors.ndjson",
    robots: "robots.ndjson",
    "sitemap-entry": "sitemaps.ndjson",
    "feed-entry": "feeds.ndjson",
  };
  return files[kind] ?? null;
}

async function metadataFile(
  directory: string,
  key: "manifest" | "config" | "stats" | "summary",
): Promise<unknown | null> {
  const fileName = key === "config" ? "config.resolved.json" : `${key}.json`;
  const target = path.join(directory, fileName);
  if (!(await exists(target))) return null;
  return JSON.parse(await fs.readFile(target, "utf8"));
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
