import type { ResolvedCrawlConfig } from "../../config/types.js";
import { makeId, nowIso } from "../../core/utils.js";
import type {
  CrawlRequest,
  RequestState,
  RequestStateRecord,
} from "../../requests/types.js";
import type { FrontierBackend, LeaseSelection } from "../backend-types.js";
import { createRequestStateRecord } from "../state-record.js";
import type {
  EnqueueInput,
  EnqueueResult,
  FrontierSnapshot,
  RequestLease,
  SeedRequestCount,
  TerminalRequestState,
} from "../types.js";
import { SqliteConnection } from "./sqlite-connection.js";
import { SqliteFrontierEnqueuer } from "./sqlite-enqueuer.js";
import { SqliteLeaseRepository } from "./sqlite-lease-repository.js";
import { SqliteRequestRepository } from "./sqlite-request-repository.js";

export class SqliteFrontierBackend implements FrontierBackend {
  private readonly connection: SqliteConnection;
  private requests: SqliteRequestRepository | null = null;
  private leases: SqliteLeaseRepository | null = null;
  private enqueuer: SqliteFrontierEnqueuer | null = null;
  private readonly runId: string;
  private readonly config: ResolvedCrawlConfig;

  public constructor(
    runId: string,
    config: ResolvedCrawlConfig,
    databasePath: string,
  ) {
    this.runId = runId;
    this.config = config;
    this.connection = new SqliteConnection(databasePath, config.storage.fsync);
  }

  public get size(): number {
    return this.requests?.pendingCount() ?? 0;
  }

  public get outstandingCount(): number {
    return this.requests?.outstandingCount() ?? 0;
  }

  public requestForKey(uniqueKey: string): CrawlRequest | null {
    return this.requests?.requestForKey(uniqueKey) ?? null;
  }

  public seedRequestCounts(): readonly SeedRequestCount[] {
    return this.requests?.seedCounts() ?? [];
  }

  public knownRequests(): readonly CrawlRequest[] {
    return this.requests?.requests() ?? [];
  }

  public async init(): Promise<FrontierSnapshot> {
    await this.connection.open();
    const requests = new SqliteRequestRepository(this.connection.database());
    this.requests = requests;
    this.leases = new SqliteLeaseRepository(this.connection.database());
    this.enqueuer = new SqliteFrontierEnqueuer(
      this.runId,
      this.config,
      requests,
    );
    return requests.recover(Date.now(), nowIso());
  }

  public async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    return this.enqueueService().enqueue(input);
  }

  public async enqueueMany(
    inputs: readonly EnqueueInput[],
  ): Promise<readonly EnqueueResult[]> {
    return this.connection.transaction(() =>
      this.enqueueService().enqueueMany(inputs),
    );
  }

  public async leaseNext(
    selection: LeaseSelection,
  ): Promise<RequestLease | null> {
    const now = Date.now();
    this.leaseRepository().recoverExpired(now, nowIso());
    const first = this.requestRepository().firstReadyCandidate(
      now,
      this.config.storage.frontierOrder,
    );
    if (first !== null) {
      const lease = this.claim(first, selection);
      if (lease !== null) return lease;
    }
    for (const request of this.requestRepository().readyCandidates(
      now,
      128,
      this.config.storage.frontierOrder,
    )) {
      if (request.id === first?.id) continue;
      const lease = this.claim(request, selection);
      if (lease !== null) return lease;
    }
    return null;
  }

  public nextDeferredAt(): number | null {
    return this.leases?.nextDeferredAt() ?? null;
  }

  public stateRecord(
    request: CrawlRequest,
    state: RequestState,
    reason: string | null,
  ): RequestStateRecord {
    return createRequestStateRecord(this.runId, request, state, reason);
  }

  public async renewLease(lease: RequestLease): Promise<RequestLease> {
    const renewed = { ...lease, expiresAt: this.expiration() };
    this.leaseRepository().renew(lease, renewed.expiresAt, nowIso());
    return renewed;
  }

  public async release(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return this.transition(lease, "pending", reason);
  }

  public async markHandled(lease: RequestLease): Promise<RequestStateRecord> {
    return this.transition(lease, "handled", null);
  }

  public async markFailed(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return this.transition(lease, "failed", reason);
  }

  public async markSkipped(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return this.transition(lease, "skipped", reason);
  }

  public async markCancelled(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return this.transition(lease, "cancelled", reason);
  }

  public async flush(): Promise<void> {
    this.connection.flush();
  }

  public async close(): Promise<void> {
    this.connection.close();
  }

  private claim(
    request: CrawlRequest,
    selection: LeaseSelection,
  ): RequestLease | null {
    if (!selection.tryReserve(request)) return null;
    const lease = this.createLease(request);
    if (this.leaseRepository().claim(lease, nowIso())) return lease;
    selection.releaseReservation(request);
    return null;
  }

  private createLease(request: CrawlRequest): RequestLease {
    const leasedAt = nowIso();
    return {
      leaseId: makeId("lease", `${request.id}:${leasedAt}`),
      request,
      leasedAt,
      expiresAt: this.expiration(),
    };
  }

  private transition(
    lease: RequestLease,
    state: TerminalRequestState | "pending",
    reason: string | null,
  ): RequestStateRecord {
    this.leaseRepository().transition(lease, state, reason, nowIso());
    return this.stateRecord(lease.request, state, reason);
  }

  private expiration(): string {
    return new Date(
      Date.now() + this.config.storage.leaseDurationMs,
    ).toISOString();
  }

  private requestRepository(): SqliteRequestRepository {
    if (this.requests === null)
      throw new Error("SQLite frontier is not initialized.");
    return this.requests;
  }

  private leaseRepository(): SqliteLeaseRepository {
    if (this.leases === null)
      throw new Error("SQLite frontier is not initialized.");
    return this.leases;
  }

  private enqueueService(): SqliteFrontierEnqueuer {
    if (this.enqueuer === null)
      throw new Error("SQLite frontier is not initialized.");
    return this.enqueuer;
  }
}
