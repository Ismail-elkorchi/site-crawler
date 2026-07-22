import type { DatabaseSync } from "node:sqlite";
import type { RequestState } from "../../requests/types.js";
import type { RequestLease } from "../types.js";
import { nullableIntegerFromRow } from "./sqlite-rows.js";

export class SqliteLeaseRepository {
  private readonly database: DatabaseSync;

  public constructor(database: DatabaseSync) {
    this.database = database;
  }

  public claim(lease: RequestLease, updatedAt: string): boolean {
    const result = this.database
      .prepare(
        "UPDATE frontier_requests SET state = 'in_progress', lease_id = ?, lease_expires_at = ?, updated_at = ? WHERE id = ? AND state = 'pending'",
      )
      .run(
        lease.leaseId,
        Date.parse(lease.expiresAt),
        updatedAt,
        lease.request.id,
      );
    return changesNumber(result.changes) === 1;
  }

  public renew(
    lease: RequestLease,
    expiresAt: string,
    updatedAt: string,
  ): void {
    const result = this.database
      .prepare(
        "UPDATE frontier_requests SET lease_expires_at = ?, updated_at = ? WHERE id = ? AND state = 'in_progress' AND lease_id = ?",
      )
      .run(Date.parse(expiresAt), updatedAt, lease.request.id, lease.leaseId);
    if (changesNumber(result.changes) !== 1) throw staleLease(lease);
  }

  public transition(
    lease: RequestLease,
    state: RequestState,
    reason: string | null,
    updatedAt: string,
  ): void {
    const availableAt = state === "pending" ? Date.now() : 0;
    const result = this.database
      .prepare(
        "UPDATE frontier_requests SET state = ?, reason = ?, lease_id = NULL, lease_expires_at = NULL, available_at = ?, updated_at = ? WHERE id = ? AND state = 'in_progress' AND lease_id = ?",
      )
      .run(
        state,
        reason,
        availableAt,
        updatedAt,
        lease.request.id,
        lease.leaseId,
      );
    if (changesNumber(result.changes) !== 1) throw staleLease(lease);
  }

  public recoverExpired(now: number, updatedAt: string): number {
    const result = this.database
      .prepare(
        "UPDATE frontier_requests SET state = 'pending', lease_id = NULL, lease_expires_at = NULL, available_at = ?, updated_at = ? WHERE state = 'in_progress' AND lease_expires_at <= ?",
      )
      .run(now, updatedAt, now);
    return changesNumber(result.changes);
  }

  public nextDeferredAt(): number | null {
    return nullableIntegerFromRow(
      this.database
        .prepare(
          "SELECT MIN(lease_expires_at) AS next_at FROM frontier_requests WHERE state = 'in_progress'",
        )
        .get(),
      "next_at",
    );
  }
}

function changesNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function staleLease(lease: RequestLease): Error {
  return new Error(`Invalid or stale lease for request ${lease.request.id}.`);
}
