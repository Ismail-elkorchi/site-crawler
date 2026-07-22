import path from "node:path";
import type { ResolvedCrawlConfig } from "../config/types.js";
import { FileSystemStore } from "./filesystem-store.js";
import { MemoryStore } from "./memory-store.js";
import { SqliteResultStore } from "./sqlite/store.js";
import type { ResultStore } from "./types.js";

export function createStore(
  config: ResolvedCrawlConfig,
  runId: string,
  onBackpressure: (pendingRecords: number) => void,
): ResultStore {
  if (config.storage.type === "memory") {
    return new MemoryStore(
      config.storage.storeRawHtml,
      config.storage.storeRawXml,
    );
  }
  const directory = path.resolve(
    config.storage.resumeFrom ?? path.join(config.storage.directory, runId),
  );
  if (config.storage.type === "sqlite") {
    return new SqliteResultStore(directory, config, onBackpressure);
  }
  return new FileSystemStore(
    directory,
    config.storage.writeBufferSize,
    config.storage.fsync,
    config.storage.storeRawHtml,
    config.storage.storeRawXml,
    onBackpressure,
    config.storage.writeNdjsonExports,
  );
}
