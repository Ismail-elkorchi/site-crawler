import { AsyncMutex } from "../core/concurrency/mutex.js";
import { makeId, nowIso } from "../core/utils.js";
import type {
  CrawlRequest,
  RequestState,
  RequestStateRecord,
} from "../requests/types.js";
import type { FrontierJournal } from "./journal.js";
import type { RequestLease, TerminalRequestState } from "./types.js";

export class FrontierLeaseManager {
  private readonly active = new Map<string, RequestLease>();
  private readonly transitionMutex = new AsyncMutex();
  private readonly states = new Map<string, RequestState>();
  private readonly runId: string;
  private readonly leaseDurationMs: number;
  private readonly journal: FrontierJournal;

  public constructor(
    runId: string,
    leaseDurationMs: number,
    journal: FrontierJournal,
  ) {
    this.runId = runId;
    this.leaseDurationMs = leaseDurationMs;
    this.journal = journal;
  }

  public get activeCount(): number {
    return this.active.size;
  }

  public restorePending(request: CrawlRequest): void {
    this.states.set(request.id, "pending");
  }

  public async lease(request: CrawlRequest): Promise<RequestLease> {
    return await this.transitionMutex.runExclusive(async () => {
      const leasedAt = nowIso();
      const lease: RequestLease = {
        leaseId: makeId("lease", `${request.id}:${leasedAt}`),
        request,
        leasedAt,
        expiresAt: this.expiration(),
      };
      await this.journal.append({
        schemaId: "site-crawler.frontierJournal",
        schemaVersion: 1,
        type: "leased",
        requestId: request.id,
        leaseId: lease.leaseId,
        expiresAt: lease.expiresAt,
        createdAt: leasedAt,
      });
      this.active.set(request.id, lease);
      this.states.set(request.id, "in_progress");
      return lease;
    });
  }

  public async renew(lease: RequestLease): Promise<RequestLease> {
    return await this.transitionMutex.runExclusive(async () => {
      this.assertActive(lease);
      const renewed: RequestLease = { ...lease, expiresAt: this.expiration() };
      await this.journal.append({
        schemaId: "site-crawler.frontierJournal",
        schemaVersion: 1,
        type: "renewed",
        requestId: lease.request.id,
        leaseId: lease.leaseId,
        expiresAt: renewed.expiresAt,
        createdAt: nowIso(),
      });
      this.active.set(lease.request.id, renewed);
      return renewed;
    });
  }

  public stateRecord(
    request: CrawlRequest,
    state: RequestState,
    reason: string | null,
  ): RequestStateRecord {
    return {
      schemaId: "site-crawler.requestState",
      schemaVersion: 1,
      runId: this.runId,
      requestId: request.id,
      uniqueKey: request.uniqueKey,
      state,
      reason,
      updatedAt: nowIso(),
    };
  }

  public async release(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return await this.transitionMutex.runExclusive(async () => {
      this.assertActive(lease);
      await this.journal.append({
        schemaId: "site-crawler.frontierJournal",
        schemaVersion: 1,
        type: "released",
        requestId: lease.request.id,
        leaseId: lease.leaseId,
        reason,
        createdAt: nowIso(),
      });
      this.active.delete(lease.request.id);
      this.states.set(lease.request.id, "pending");
      return this.stateRecord(lease.request, "pending", reason);
    });
  }

  public async finish(
    lease: RequestLease,
    state: TerminalRequestState,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return await this.transitionMutex.runExclusive(async () => {
      this.assertActive(lease);
      await this.journal.append({
        schemaId: "site-crawler.frontierJournal",
        schemaVersion: 1,
        type: state,
        requestId: lease.request.id,
        leaseId: lease.leaseId,
        reason,
        createdAt: nowIso(),
      });
      this.active.delete(lease.request.id);
      this.states.set(lease.request.id, state);
      return this.stateRecord(lease.request, state, reason);
    });
  }

  private expiration(): string {
    return new Date(Date.now() + this.leaseDurationMs).toISOString();
  }

  private assertActive(lease: RequestLease): void {
    const active = this.active.get(lease.request.id);
    if (active?.leaseId !== lease.leaseId) {
      throw new Error(
        `Invalid or stale lease for request ${lease.request.id}.`,
      );
    }
  }
}
