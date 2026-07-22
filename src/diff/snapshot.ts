import type { CrawlRecordKind } from "../storage/types.js";
import { openRunReader } from "../runs/reader.js";

export interface DiffSnapshot {
  readonly resources: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly pages: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly links: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly sitemaps: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly robots: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}

export async function readDiffSnapshot(
  runDirectory: string,
): Promise<DiffSnapshot> {
  const reader = await openRunReader(runDirectory);
  try {
    return {
      resources: await keyedRecords(reader, "resource", resourceKey),
      pages: await keyedRecords(reader, "html-page", pageKey),
      links: await keyedRecords(reader, "link", linkKey),
      sitemaps: await keyedRecords(reader, "sitemap-entry", sitemapKey),
      robots: await keyedRecords(reader, "robots", robotsKey),
    };
  } finally {
    await reader.close();
  }
}

async function keyedRecords(
  reader: Awaited<ReturnType<typeof openRunReader>>,
  kind: CrawlRecordKind,
  keyOf: (record: Readonly<Record<string, unknown>>) => string | null,
): Promise<ReadonlyMap<string, Readonly<Record<string, unknown>>>> {
  const result = new Map<string, Readonly<Record<string, unknown>>>();
  for await (const item of reader.records(kind)) {
    if (!isRecord(item.data)) continue;
    const key = keyOf(item.data);
    if (key !== null) result.set(key, item.data);
  }
  return result;
}

function resourceKey(record: Readonly<Record<string, unknown>>): string | null {
  return (
    stringValue(record["normalizedUrl"]) ?? stringValue(record["finalUrl"])
  );
}

function pageKey(record: Readonly<Record<string, unknown>>): string | null {
  return (
    stringValue(record["normalizedUrl"]) ?? stringValue(record["finalUrl"])
  );
}

function linkKey(record: Readonly<Record<string, unknown>>): string | null {
  const from = stringValue(record["fromUrl"]);
  const to = stringValue(record["toNormalized"]);
  const kind = stringValue(record["linkKind"]);
  return from === null || to === null || kind === null
    ? null
    : `${from}\u0000${to}\u0000${kind}`;
}

function sitemapKey(record: Readonly<Record<string, unknown>>): string | null {
  const sitemap = stringValue(record["sitemapUrl"]);
  const url = stringValue(record["normalizedUrl"]);
  const kind = stringValue(record["entryKind"]);
  return sitemap === null || url === null || kind === null
    ? null
    : `${sitemap}\u0000${url}\u0000${kind}`;
}

function robotsKey(record: Readonly<Record<string, unknown>>): string | null {
  return stringValue(record["origin"]);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
