import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CrawlRecordQuery, IndexedCrawlRecord } from "../types.js";
import { queryRecords } from "./query.js";
import type { RecordEnvelope } from "./record.js";
import { RESULT_STORE_SCHEMA } from "./schema.js";
import { protectPrivateFile } from "../../core/private-files.js";
import { validatePersistedRecord } from "../../contracts/catalog.js";

export class SqliteRecordDatabase {
  private readonly path: string;
  private database: DatabaseSync | null = null;

  public constructor(outputDirectory: string, fileName: string) {
    this.path = path.join(outputDirectory, fileName);
  }

  public async open(): Promise<void> {
    this.database = new DatabaseSync(this.path);
    await protectPrivateFile(this.path);
    this.database.exec(RESULT_STORE_SCHEMA);
  }

  public insert(record: RecordEnvelope): void {
    validatePersistedRecord(record.value);
    this.requireDatabase()
      .prepare(
        "INSERT OR IGNORE INTO crawl_records (kind, record_id, request_id, url, status_code, from_url, to_url, created_at, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        record.kind,
        record.recordId,
        record.requestId,
        record.url,
        record.statusCode,
        record.fromUrl,
        record.toUrl,
        record.createdAt,
        JSON.stringify(record.value),
      );
  }

  public writeMetadata(key: string, value: unknown): void {
    validatePersistedRecord(value);
    this.requireDatabase()
      .prepare(
        "INSERT INTO crawl_metadata (key, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
      )
      .run(key, JSON.stringify(value), new Date().toISOString());
  }

  public query(query: CrawlRecordQuery): readonly IndexedCrawlRecord[] {
    return queryRecords(this.requireDatabase(), query);
  }

  public checkpoint(): void {
    this.requireDatabase().exec("PRAGMA wal_checkpoint(FULL)");
  }

  public close(): void {
    this.database?.close();
    this.database = null;
  }

  private requireDatabase(): DatabaseSync {
    if (this.database === null)
      throw new Error("SQLite result store is not initialized.");
    return this.database;
  }
}
