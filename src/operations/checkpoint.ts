import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseRunManifest } from "../crawler/resume-schema.js";
import { record, stringField } from "../validation/primitives.js";
import type { CheckpointRecord } from "./types.js";
import { writePrivateFileAtomic } from "../core/private-files.js";
import { validatePersistedRecord } from "../contracts/catalog.js";

export async function checkpointRun(
  runDirectory: string,
): Promise<CheckpointRecord> {
  const directory = path.resolve(runDirectory);
  const manifest = parseRunManifest(
    await fs.readFile(path.join(directory, "manifest.json"), "utf8"),
  );
  const config: unknown = JSON.parse(
    await fs.readFile(path.join(directory, "config.resolved.json"), "utf8"),
  );
  const storage = record(
    record(config, "resolved config")["storage"],
    "storage config",
  );
  const frontierBackend = stringField(storage, "frontierBackend");
  if (
    frontierBackend !== "memory" &&
    frontierBackend !== "journal" &&
    frontierBackend !== "sqlite"
  ) {
    throw new Error("Frontier backend is malformed.");
  }
  const counts: Record<string, number> = {};
  for (const fileName of [
    "crawl.sqlite",
    "frontier.sqlite",
    "coordination.sqlite",
  ]) {
    const target = path.join(directory, fileName);
    if (!(await exists(target))) continue;
    const database = new DatabaseSync(target);
    try {
      database.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA optimize;");
      counts[fileName] = Number(
        database.prepare("PRAGMA page_count").get()?.["page_count"] ?? 0,
      );
    } finally {
      database.close();
    }
  }
  const recordValue: CheckpointRecord = {
    schemaId: "site-crawler.checkpoint",
    schemaVersion: 1,
    runId: manifest.runId,
    createdAt: new Date().toISOString(),
    sequence: Date.now(),
    frontierBackend,
    counts,
  };
  validatePersistedRecord(recordValue);
  await writePrivateFileAtomic(
    path.join(directory, "checkpoint.json"),
    `${JSON.stringify(recordValue, null, 2)}\n`,
    true,
  );
  return recordValue;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
