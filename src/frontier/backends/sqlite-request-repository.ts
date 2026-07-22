import type { DatabaseSync, StatementSync } from "node:sqlite";
import type { CrawlRequest } from "../../requests/types.js";
import type {
  FrontierOrder,
  FrontierSnapshot,
  SeedRequestCount,
} from "../types.js";
import {
  integerFromRow,
  requestFromRow,
  stringFromRow,
} from "./sqlite-rows.js";

export class SqliteRequestRepository {
  private readonly outstandingCountStatement: StatementSync;
  private readonly pendingCountStatement: StatementSync;
  private readonly requestForKeyStatement: StatementSync;
  private readonly seedCountsStatement: StatementSync;
  private readonly requestsStatement: StatementSync;
  private readonly deferredLeaseCountStatement: StatementSync;
  private readonly recoverExpiredStatement: StatementSync;
  private readonly resumableCountStatement: StatementSync;
  private readonly insertStatement: StatementSync;
  private readonly firstReadyStatements: Readonly<
    Record<FrontierOrder, StatementSync>
  >;
  private readonly readyStatements: Readonly<
    Record<FrontierOrder, StatementSync>
  >;

  public constructor(database: DatabaseSync) {
    this.outstandingCountStatement = database.prepare(
      "SELECT COUNT(*) AS count FROM frontier_requests WHERE state IN ('pending', 'in_progress')",
    );
    this.pendingCountStatement = database.prepare(
      "SELECT COUNT(*) AS count FROM frontier_requests WHERE state = 'pending'",
    );
    this.requestForKeyStatement = database.prepare(
      "SELECT request_json FROM frontier_requests WHERE unique_key = ?",
    );
    this.seedCountsStatement = database.prepare(
      "SELECT seed_url, COUNT(*) AS count FROM frontier_requests GROUP BY seed_url ORDER BY seed_url",
    );
    this.requestsStatement = database.prepare(
      "SELECT request_json FROM frontier_requests ORDER BY rowid",
    );
    this.deferredLeaseCountStatement = database.prepare(
      "SELECT COUNT(*) AS count FROM frontier_requests WHERE state = 'in_progress' AND lease_expires_at > ?",
    );
    this.recoverExpiredStatement = database.prepare(
      "UPDATE frontier_requests SET state = 'pending', lease_id = NULL, lease_expires_at = NULL, available_at = ?, updated_at = ? WHERE state = 'in_progress' AND lease_expires_at <= ?",
    );
    this.resumableCountStatement = database.prepare(
      "SELECT COUNT(*) AS count FROM frontier_requests WHERE state IN ('pending', 'in_progress')",
    );
    this.insertStatement = database.prepare(
      "INSERT OR IGNORE INTO frontier_requests (id, unique_key, request_json, state, priority, depth, origin, seed_url, created_at, updated_at, available_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 0)",
    );
    this.firstReadyStatements = {
      bfs: database.prepare(firstReadyCandidateSql("bfs")),
      dfs: database.prepare(firstReadyCandidateSql("dfs")),
      priority: database.prepare(firstReadyCandidateSql("priority")),
    };
    this.readyStatements = {
      bfs: database.prepare(readyCandidatesSql("bfs")),
      dfs: database.prepare(readyCandidatesSql("dfs")),
      priority: database.prepare(readyCandidatesSql("priority")),
    };
  }

  public outstandingCount(): number {
    return integerFromRow(this.outstandingCountStatement.get(), "count");
  }

  public pendingCount(): number {
    return integerFromRow(this.pendingCountStatement.get(), "count");
  }

  public requestForKey(uniqueKey: string): CrawlRequest | null {
    return requestFromRow(this.requestForKeyStatement.get(uniqueKey));
  }

  public seedCounts(): readonly SeedRequestCount[] {
    return this.seedCountsStatement.all().map((row) => ({
      seedUrl: stringFromRow(row, "seed_url"),
      count: integerFromRow(row, "count"),
    }));
  }

  public requests(): readonly CrawlRequest[] {
    return this.requestsStatement.all().map(requestFromRow).filter(isRequest);
  }

  public recover(now: number, updatedAt: string): FrontierSnapshot {
    const deferred = integerFromRow(
      this.deferredLeaseCountStatement.get(now),
      "count",
    );
    const result = this.recoverExpiredStatement.run(now, updatedAt, now);
    const resumed = integerFromRow(this.resumableCountStatement.get(), "count");
    return {
      resumedRequests: resumed,
      recoveredLeases: changesNumber(result.changes),
      deferredLeases: deferred,
    };
  }

  public insert(request: CrawlRequest): boolean {
    const result = this.insertStatement.run(
      request.id,
      request.uniqueKey,
      JSON.stringify(request),
      request.priority,
      request.depth,
      new URL(request.normalizedUrl).origin,
      request.seedUrl,
      request.createdAt,
      request.updatedAt,
    );
    return changesNumber(result.changes) === 1;
  }

  public firstReadyCandidate(
    now: number,
    order: FrontierOrder,
  ): CrawlRequest | null {
    return requestFromRow(this.firstReadyStatements[order].get(now));
  }

  public readyCandidates(
    now: number,
    limit: number,
    order: FrontierOrder,
  ): readonly CrawlRequest[] {
    return this.readyStatements[order]
      .all(now, limit)
      .map(requestFromRow)
      .filter(isRequest);
  }
}

function changesNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function isRequest(value: CrawlRequest | null): value is CrawlRequest {
  return value !== null;
}

function firstReadyCandidateSql(order: FrontierOrder): string {
  return `SELECT request_json
  FROM frontier_requests
  WHERE state = 'pending'
    AND available_at <= ?
  ORDER BY ${requestOrderSql(order, "rowid")}
  LIMIT 1`;
}

function readyCandidatesSql(order: FrontierOrder): string {
  return `WITH eligible AS (
    SELECT
      request_json,
      priority,
      depth,
      rowid AS insertion_sequence,
      ROW_NUMBER() OVER (
        PARTITION BY origin
        ORDER BY ${requestOrderSql(order, "rowid")}
      ) AS origin_rank
    FROM frontier_requests
    WHERE state = 'pending'
      AND available_at <= ?
  )
  SELECT request_json
  FROM eligible
  WHERE origin_rank = 1
  ORDER BY ${requestOrderSql(order, "insertion_sequence")}
  LIMIT ?`;
}

function requestOrderSql(
  order: FrontierOrder,
  insertionColumn: "rowid" | "insertion_sequence",
): string {
  if (order === "priority")
    return `priority DESC, depth ASC, ${insertionColumn} ASC`;
  return `${insertionColumn} ${order === "dfs" ? "DESC" : "ASC"}`;
}
