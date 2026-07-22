import path from "node:path";
import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlRequest, DiscoveryRecord } from "../requests/types.js";
import type { EnqueueResult } from "./types.js";

export function resolveFrontierOutputDirectory(
  runId: string,
  config: ResolvedCrawlConfig,
): string | null {
  if (!config.storage.durableFrontier || config.storage.type === "memory") {
    return null;
  }
  return path.resolve(
    config.storage.resumeFrom ?? path.join(config.storage.directory, runId),
  );
}

export function resolveFrontierJournalPath(
  runId: string,
  config: ResolvedCrawlConfig,
): string | null {
  if (config.storage.frontierBackend !== "journal") return null;
  const directory = resolveFrontierOutputDirectory(runId, config);
  return directory === null ? null : path.join(directory, "frontier.ndjson");
}

export function resolveFrontierDatabasePath(
  runId: string,
  config: ResolvedCrawlConfig,
): string | null {
  if (config.storage.frontierBackend !== "sqlite") return null;
  const directory = resolveFrontierOutputDirectory(runId, config);
  return directory === null
    ? null
    : path.join(directory, config.storage.sqliteFileName);
}

export function duplicateEnqueueResult(
  existing: CrawlRequest,
  discovery: DiscoveryRecord,
): EnqueueResult {
  return {
    decision: {
      status: "already_seen",
      reason: "Duplicate normalized URL",
      requestId: existing.id,
    },
    request: null,
    skipped: null,
    discovery,
    state: null,
  };
}
