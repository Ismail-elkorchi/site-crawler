import fs from "node:fs/promises";
import path from "node:path";
import { openRunReader } from "../runs/reader.js";
import type { CrawlRecordKind } from "../storage/types.js";
import { record, stringField } from "../validation/primitives.js";
import type { RunInspection } from "./types.js";

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

export async function inspectRun(runDirectory: string): Promise<RunInspection> {
  const directory = path.resolve(runDirectory);
  const reader = await openRunReader(directory);
  try {
    const manifest = await reader.metadata("manifest");
    const manifestRecord = record(manifest, "run manifest");
    const counts: Record<string, number> = {};
    for (const kind of recordKinds) {
      let count = 0;
      for await (const _record of reader.records(kind)) count += 1;
      counts[kind] = count;
    }
    return {
      schemaId: "site-crawler.runInspection",
      schemaVersion: 1,
      runId: stringField(manifestRecord, "runId"),
      directory,
      createdAt: new Date().toISOString(),
      manifest,
      counts,
      files: await listFiles(directory),
    };
  } finally {
    await reader.close();
  }
}

async function listFiles(directory: string): Promise<readonly string[]> {
  const output: string[] = [];
  await walk(directory, directory, output);
  return output.sort();
}

async function walk(
  root: string,
  directory: string,
  output: string[],
): Promise<void> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(root, target, output);
    else if (entry.isFile()) output.push(path.relative(root, target));
  }
}
