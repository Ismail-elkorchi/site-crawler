import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface CompactedDatabase {
  readonly fileName: string;
  readonly beforeBytes: number;
  readonly afterBytes: number;
}

export interface CompactRunReport {
  readonly directory: string;
  readonly compactedAt: string;
  readonly databases: readonly CompactedDatabase[];
}

export async function compactRun(
  runDirectory: string,
): Promise<CompactRunReport> {
  const directory = path.resolve(runDirectory);
  const databases: CompactedDatabase[] = [];
  for (const fileName of [
    "crawl.sqlite",
    "frontier.sqlite",
    "coordination.sqlite",
  ] as const) {
    const target = path.join(directory, fileName);
    if (!(await exists(target))) continue;
    const beforeBytes = (await fs.stat(target)).size;
    const database = new DatabaseSync(target);
    try {
      database.exec(
        "PRAGMA trusted_schema = OFF; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA optimize; VACUUM;",
      );
    } finally {
      database.close();
    }
    databases.push({
      fileName,
      beforeBytes,
      afterBytes: (await fs.stat(target)).size,
    });
  }
  return { directory, compactedAt: new Date().toISOString(), databases };
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
