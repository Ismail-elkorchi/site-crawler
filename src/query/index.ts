import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ResourceType } from "../resources/types.js";
import {
  duplicateHashes,
  linksFrom,
  linksTo,
  recordsByResourceType,
  urlsOnlyIn,
} from "../storage/sqlite/advanced-query.js";
import { countRecords, queryRecords } from "../storage/sqlite/query.js";
import type { CrawlRecordQuery, IndexedCrawlRecord } from "../storage/types.js";
import type {
  CrawlIndexOptions,
  CrawlIndexReader,
  DuplicateBodyHashGroup,
} from "./types.js";

export class CrawlIndex implements CrawlIndexReader {
  private readonly database: DatabaseSync;

  public constructor(runDirectory: string, options: CrawlIndexOptions = {}) {
    this.database = new DatabaseSync(
      path.join(runDirectory, options.sqliteFileName ?? "crawl.sqlite"),
      { readOnly: true },
    );
  }

  public query(query: CrawlRecordQuery): readonly IndexedCrawlRecord[] {
    return queryRecords(this.database, query);
  }

  public count(query: CrawlRecordQuery = {}): number {
    return countRecords(this.database, query);
  }

  public metadata(
    key: "manifest" | "config" | "stats" | "summary",
  ): unknown | null {
    const row = this.database
      .prepare("SELECT json FROM crawl_metadata WHERE key = ?")
      .get(key);
    if (!isRecord(row)) return null;
    const json = row["json"];
    if (typeof json !== "string")
      throw new Error("SQLite metadata is invalid.");
    return JSON.parse(json);
  }

  public resourcesByType(
    resourceType: ResourceType,
    limit = 1000,
  ): readonly IndexedCrawlRecord[] {
    return recordsByResourceType(this.database, resourceType, limit);
  }

  public outgoingLinks(
    fromUrl: string,
    limit = 1000,
  ): readonly IndexedCrawlRecord[] {
    return linksFrom(this.database, fromUrl, limit);
  }

  public incomingLinks(
    toUrl: string,
    limit = 1000,
  ): readonly IndexedCrawlRecord[] {
    return linksTo(this.database, toUrl, limit);
  }

  public sitemapOnlyUrls(limit = 1000): readonly string[] {
    return urlsOnlyIn(this.database, "sitemap-entry", "html-page", limit);
  }

  public htmlOnlyUrls(limit = 1000): readonly string[] {
    return urlsOnlyIn(this.database, "html-page", "sitemap-entry", limit);
  }

  public duplicateBodyHashes(limit = 1000): readonly DuplicateBodyHashGroup[] {
    return duplicateHashes(this.database, limit);
  }

  public close(): void {
    this.database.close();
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
