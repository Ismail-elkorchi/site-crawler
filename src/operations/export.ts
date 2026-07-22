import fs from "node:fs/promises";
import path from "node:path";
import { openRunReader } from "../runs/reader.js";
import { validatePersistedRecord } from "../contracts/catalog.js";
import type { CrawlRecordKind } from "../storage/types.js";
import {
  ensurePrivateDirectory,
  openPrivateFile,
  writePrivateFileAtomic,
} from "../core/private-files.js";

const recordKinds: readonly CrawlRecordKind[] = [
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
];

export interface ExportRunOptions {
  readonly kinds?: readonly CrawlRecordKind[];
  readonly includeMetadata?: boolean;
}

export interface ExportRunReport {
  readonly schemaId: "site-crawler.exportReport";
  readonly schemaVersion: 1;
  readonly sourceDirectory: string;
  readonly targetDirectory: string;
  readonly exportedAt: string;
  readonly counts: Readonly<Record<string, number>>;
}

export async function exportRun(
  runDirectory: string,
  targetDirectory: string,
  options: ExportRunOptions = {},
): Promise<ExportRunReport> {
  const source = path.resolve(runDirectory);
  const target = path.resolve(targetDirectory);
  if (source === target)
    throw new Error("Export target must differ from the run directory.");
  await ensurePrivateDirectory(target);
  const reader = await openRunReader(source);
  const counts: Record<string, number> = {};
  try {
    if (options.includeMetadata !== false) {
      for (const key of ["manifest", "config", "stats"] as const) {
        const value = await reader.metadata(key);
        if (value !== null)
          await atomicJson(path.join(target, metadataName(key)), value);
      }
    }
    for (const kind of options.kinds ?? recordKinds) {
      const file = path.join(target, `${kind}.ndjson`);
      const handle = await openPrivateFile(file, "w");
      let count = 0;
      try {
        for await (const record of reader.records(kind)) {
          await handle.write(`${JSON.stringify(record.data)}\n`);
          count += 1;
        }
      } finally {
        await handle.close();
      }
      counts[kind] = count;
      if (count === 0) await fs.rm(file, { force: true });
    }
  } finally {
    await reader.close();
  }
  const report: ExportRunReport = {
    schemaId: "site-crawler.exportReport",
    schemaVersion: 1,
    sourceDirectory: source,
    targetDirectory: target,
    exportedAt: new Date().toISOString(),
    counts,
  };
  validatePersistedRecord(report);
  await atomicJson(path.join(target, "export.json"), report);
  return report;
}

function metadataName(key: "manifest" | "config" | "stats"): string {
  return key === "config" ? "config.resolved.json" : `${key}.json`;
}

async function atomicJson(target: string, value: unknown): Promise<void> {
  await writePrivateFileAtomic(
    target,
    `${JSON.stringify(value, null, 2)}\n`,
    false,
  );
}
