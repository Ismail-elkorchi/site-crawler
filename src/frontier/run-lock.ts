import fs from "node:fs/promises";
import os from "node:os";
import { hasCurrentSchema } from "../contracts/schema-identity.js";
import path from "node:path";
import { nowIso } from "../core/utils.js";
import { validatePersistedRecord } from "../contracts/catalog.js";
import {
  ensurePrivateDirectory,
  openPrivateFile,
  writePrivateFileAtomic,
} from "../core/private-files.js";

interface LockRecord {
  readonly schemaId: "site-crawler.runLock";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly pid: number;
  readonly hostname: string;
  readonly createdAt: string;
  readonly heartbeatAt: string;
}

export class RunLock {
  private heartbeat: NodeJS.Timeout | null = null;
  private owned = false;
  private readonly filePath: string | null;
  private readonly runId: string;
  private readonly heartbeatMs: number;
  private readonly staleMs: number;

  public constructor(
    runId: string,
    outputDirectory: string | null,
    heartbeatMs: number,
    staleMs: number,
  ) {
    this.runId = runId;
    this.filePath =
      outputDirectory === null
        ? null
        : path.join(outputDirectory, "run.lock.json");
    this.heartbeatMs = heartbeatMs;
    this.staleMs = staleMs;
  }

  public async acquire(): Promise<void> {
    if (this.filePath === null) return;
    await ensurePrivateDirectory(path.dirname(this.filePath));
    try {
      await this.create();
    } catch (caught) {
      if (!isExists(caught)) throw caught;
      const existing = await this.readExisting();
      if (existing !== null && this.isActive(existing)) {
        throw new Error(
          `Run directory is already owned by process ${existing.pid} on ${existing.hostname}.`,
        );
      }
      await fs.rm(this.filePath, { force: true });
      await this.create();
    }
    this.owned = true;
    this.heartbeat = setInterval(() => {
      this.writeHeartbeat().catch(() => undefined);
    }, this.heartbeatMs);
  }

  public async release(): Promise<void> {
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (!this.owned || this.filePath === null) return;
    const existing = await this.readExisting();
    if (existing?.pid === process.pid && existing.runId === this.runId) {
      await fs.rm(this.filePath, { force: true });
    }
    this.owned = false;
  }

  private async create(): Promise<void> {
    if (this.filePath === null) return;
    const timestamp = nowIso();
    const record: LockRecord = {
      schemaId: "site-crawler.runLock",
      schemaVersion: 1,
      runId: this.runId,
      pid: process.pid,
      hostname: os.hostname(),
      createdAt: timestamp,
      heartbeatAt: timestamp,
    };
    validatePersistedRecord(record);
    const handle = await openPrivateFile(this.filePath, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
    } finally {
      await handle.close();
    }
  }

  private async writeHeartbeat(): Promise<void> {
    if (this.filePath === null) return;
    const existing = await this.readExisting();
    if (existing === null || existing.pid !== process.pid) return;
    const updated: LockRecord = { ...existing, heartbeatAt: nowIso() };
    validatePersistedRecord(updated);
    await writePrivateFileAtomic(
      this.filePath,
      `${JSON.stringify(updated)}\n`,
      false,
    );
  }

  private async readExisting(): Promise<LockRecord | null> {
    if (this.filePath === null) return null;
    try {
      const parsed: unknown = JSON.parse(
        await fs.readFile(this.filePath, "utf8"),
      );
      return decodeLock(parsed);
    } catch {
      return null;
    }
  }

  private isActive(record: LockRecord): boolean {
    const heartbeatFresh =
      Date.now() - Date.parse(record.heartbeatAt) < this.staleMs;
    if (!heartbeatFresh) return false;
    if (record.hostname !== os.hostname()) return true;
    try {
      process.kill(record.pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

function decodeLock(value: unknown): LockRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const record = Object.fromEntries(Object.entries(value));
  return hasCurrentSchema(record, "site-crawler.runLock") &&
    typeof record["runId"] === "string" &&
    typeof record["pid"] === "number" &&
    typeof record["hostname"] === "string" &&
    typeof record["createdAt"] === "string" &&
    typeof record["heartbeatAt"] === "string"
    ? {
        schemaId: "site-crawler.runLock",
        schemaVersion: 1,
        runId: record["runId"],
        pid: record["pid"],
        hostname: record["hostname"],
        createdAt: record["createdAt"],
        heartbeatAt: record["heartbeatAt"],
      }
    : null;
}

function isExists(value: unknown): boolean {
  return value instanceof Error && "code" in value && value.code === "EEXIST";
}
