import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { makeId } from "../core/utils.js";
import { SITE_CRAWLER_WORKER_PROTOCOL } from "../core/version.js";
import { WORKER_COORDINATION_SCHEMA } from "./schema.js";
import type {
  AcquireOriginOptions,
  OriginPermit,
  WorkerRecord,
  WorkerStatus,
} from "./types.js";
import { protectPrivateFileSync } from "../core/private-files.js";

export class SqliteWorkerCoordinator {
  private readonly database: DatabaseSync;

  public constructor(runDirectory: string, fileName = "coordination.sqlite") {
    const databasePath = path.join(runDirectory, fileName);
    this.database = new DatabaseSync(databasePath);
    protectPrivateFileSync(databasePath);
    this.database.exec(WORKER_COORDINATION_SCHEMA);
  }

  public register(workerId: string, runId: string): WorkerRecord {
    const now = new Date().toISOString();
    const record: WorkerRecord = {
      schemaId: "site-crawler.workerRecord",
      schemaVersion: 1,
      workerId,
      runId,
      host: os.hostname(),
      pid: process.pid,
      protocolVersion: SITE_CRAWLER_WORKER_PROTOCOL,
      startedAt: now,
      heartbeatAt: now,
      status: "active",
    };
    this.database
      .prepare(
        "INSERT INTO crawler_workers (worker_id, run_id, host, pid, protocol_version, started_at, heartbeat_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(worker_id) DO UPDATE SET heartbeat_at = excluded.heartbeat_at, status = 'active'",
      )
      .run(
        record.workerId,
        record.runId,
        record.host,
        record.pid,
        record.protocolVersion,
        record.startedAt,
        record.heartbeatAt,
        record.status,
      );
    return record;
  }

  public heartbeat(workerId: string): void {
    const result = this.database
      .prepare(
        "UPDATE crawler_workers SET heartbeat_at = ?, status = 'active' WHERE worker_id = ?",
      )
      .run(new Date().toISOString(), workerId);
    if (Number(result.changes) !== 1) {
      throw new Error(`Worker is not registered: ${workerId}`);
    }
  }

  public stop(
    workerId: string,
    status: Exclude<WorkerStatus, "active" | "stale">,
  ): void {
    this.transaction(() => {
      this.database
        .prepare(
          "UPDATE crawler_workers SET heartbeat_at = ?, status = ? WHERE worker_id = ?",
        )
        .run(new Date().toISOString(), status, workerId);
      this.database
        .prepare("DELETE FROM origin_permits WHERE worker_id = ?")
        .run(workerId);
    });
  }

  public recoverStale(staleAfterMs: number): number {
    const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
    return this.transaction(() => {
      const stale = this.database
        .prepare(
          "SELECT worker_id FROM crawler_workers WHERE status = 'active' AND heartbeat_at < ?",
        )
        .all(cutoff);
      for (const row of stale) {
        if (!isRecord(row) || typeof row["worker_id"] !== "string") continue;
        this.database
          .prepare("DELETE FROM origin_permits WHERE worker_id = ?")
          .run(row["worker_id"]);
      }
      const result = this.database
        .prepare(
          "UPDATE crawler_workers SET status = 'stale' WHERE status = 'active' AND heartbeat_at < ?",
        )
        .run(cutoff);
      return Number(result.changes);
    });
  }

  public workers(runId: string): readonly WorkerRecord[] {
    return this.database
      .prepare(
        "SELECT worker_id, run_id, host, pid, protocol_version, started_at, heartbeat_at, status FROM crawler_workers WHERE run_id = ? ORDER BY started_at, worker_id",
      )
      .all(runId)
      .map(parseWorker);
  }

  public acquireOrigin(
    origin: string,
    workerId: string,
    options: AcquireOriginOptions,
  ): OriginPermit | null {
    return this.transaction(() => {
      const now = Date.now();
      this.database
        .prepare("DELETE FROM origin_permits WHERE expires_at <= ?")
        .run(now);
      const state = this.database
        .prepare("SELECT next_allowed_at FROM origin_state WHERE origin = ?")
        .get(origin);
      const nextAllowed = numericField(state, "next_allowed_at", 0);
      const active = this.database
        .prepare(
          "SELECT COUNT(*) AS count FROM origin_permits WHERE origin = ? AND expires_at > ?",
        )
        .get(origin, now);
      if (
        nextAllowed > now ||
        numericField(active, "count", 0) >= options.maxConcurrency
      ) {
        return null;
      }
      const acquiredAt = new Date(now).toISOString();
      const expiresAtMs = now + options.leaseDurationMs;
      const permit: OriginPermit = {
        permitId: makeId("origin-permit", `${origin}:${workerId}:${now}`),
        origin,
        workerId,
        acquiredAt,
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
      this.database
        .prepare(
          "INSERT INTO origin_permits (permit_id, origin, worker_id, acquired_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          permit.permitId,
          permit.origin,
          permit.workerId,
          permit.acquiredAt,
          expiresAtMs,
        );
      this.database
        .prepare(
          "INSERT INTO origin_state (origin, next_allowed_at, updated_at) VALUES (?, ?, ?) ON CONFLICT(origin) DO UPDATE SET next_allowed_at = excluded.next_allowed_at, updated_at = excluded.updated_at",
        )
        .run(origin, now + options.minDelayMs, acquiredAt);
      return permit;
    });
  }

  public renewOrigin(
    permit: OriginPermit,
    leaseDurationMs: number,
  ): OriginPermit {
    const expiresAtMs = Date.now() + leaseDurationMs;
    const result = this.database
      .prepare(
        "UPDATE origin_permits SET expires_at = ? WHERE permit_id = ? AND worker_id = ?",
      )
      .run(expiresAtMs, permit.permitId, permit.workerId);
    if (Number(result.changes) !== 1)
      throw new Error("Origin permit is stale.");
    return { ...permit, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  public releaseOrigin(permit: OriginPermit): void {
    this.database
      .prepare(
        "DELETE FROM origin_permits WHERE permit_id = ? AND worker_id = ?",
      )
      .run(permit.permitId, permit.workerId);
  }

  public close(): void {
    this.database.close();
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const value = operation();
      this.database.exec("COMMIT");
      return value;
    } catch (caught) {
      this.database.exec("ROLLBACK");
      throw caught;
    }
  }
}

function parseWorker(value: unknown): WorkerRecord {
  if (!isRecord(value)) throw new Error("Worker row is malformed.");
  const status = value["status"];
  if (
    status !== "active" &&
    status !== "stopping" &&
    status !== "stopped" &&
    status !== "failed" &&
    status !== "stale"
  ) {
    throw new Error("Worker status is malformed.");
  }
  const protocol = textField(value, "protocol_version");
  if (protocol !== SITE_CRAWLER_WORKER_PROTOCOL) {
    throw new Error(`Unsupported worker protocol: ${protocol}`);
  }
  return {
    schemaId: "site-crawler.workerRecord",
    schemaVersion: 1,
    workerId: textField(value, "worker_id"),
    runId: textField(value, "run_id"),
    host: textField(value, "host"),
    pid: numericField(value, "pid", -1),
    protocolVersion: protocol,
    startedAt: textField(value, "started_at"),
    heartbeatAt: textField(value, "heartbeat_at"),
    status,
  };
}

function textField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const field = value[key];
  if (typeof field !== "string") throw new Error(`${key} is malformed.`);
  return field;
}

function numericField(value: unknown, key: string, fallback: number): number {
  if (!isRecord(value)) return fallback;
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : fallback;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
