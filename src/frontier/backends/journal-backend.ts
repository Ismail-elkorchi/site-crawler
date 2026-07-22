import type { ResolvedCrawlConfig } from "../../config/types.js";
import type {
  CrawlRequest,
  RequestState,
  RequestStateRecord,
} from "../../requests/types.js";
import type { FrontierBackend, LeaseSelection } from "../backend-types.js";
import { FrontierEnqueuer } from "../enqueuer.js";
import { resolveFrontierJournalPath } from "../frontier-helpers.js";
import { FrontierJournal } from "../journal.js";
import { FrontierLeaseManager } from "../lease-manager.js";
import { recoverFrontier } from "../recovery.js";
import { FrontierRequestFactory } from "../request-factory.js";
import { FrontierState } from "../state.js";
import type {
  EnqueueInput,
  EnqueueResult,
  FrontierSnapshot,
  RequestLease,
  SeedRequestCount,
} from "../types.js";

export class JournalFrontierBackend implements FrontierBackend {
  private readonly state: FrontierState;
  private readonly journal: FrontierJournal;
  private readonly leases: FrontierLeaseManager;
  private readonly enqueuer: FrontierEnqueuer;
  private readonly resumeEnabled: boolean;

  public constructor(runId: string, config: ResolvedCrawlConfig) {
    this.state = new FrontierState(config.storage.frontierOrder);
    this.resumeEnabled = config.storage.resumeFrom !== null;
    this.journal = new FrontierJournal(
      resolveFrontierJournalPath(runId, config),
      config.storage.fsync,
    );
    this.leases = new FrontierLeaseManager(
      runId,
      config.storage.leaseDurationMs,
      this.journal,
    );
    this.enqueuer = new FrontierEnqueuer({
      config,
      state: this.state,
      journal: this.journal,
      leases: this.leases,
      factory: new FrontierRequestFactory(runId, config),
    });
  }

  public get size(): number {
    return this.state.size;
  }

  public get outstandingCount(): number {
    return this.state.size + this.leases.activeCount;
  }

  public requestForKey(uniqueKey: string): CrawlRequest | null {
    return this.state.requestForKey(uniqueKey);
  }

  public seedRequestCounts(): readonly SeedRequestCount[] {
    return this.state.seedRequestCounts();
  }

  public knownRequests(): readonly CrawlRequest[] {
    return this.state.knownRequests();
  }

  public async init(): Promise<FrontierSnapshot> {
    const records = await this.journal.load();
    if (!this.resumeEnabled) return emptySnapshot();
    const recovered = recoverFrontier(records);
    for (const request of recovered.requests) this.state.remember(request);
    for (const request of recovered.pending) this.restorePending(request);
    for (const request of recovered.deferred) this.state.addDeferred(request);
    return {
      resumedRequests: recovered.pending.length + recovered.deferred.length,
      recoveredLeases: recovered.recoveredLeases,
      deferredLeases: recovered.deferred.length,
    };
  }

  public async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    return await this.enqueuer.enqueue(input);
  }

  public async enqueueMany(
    inputs: readonly EnqueueInput[],
  ): Promise<readonly EnqueueResult[]> {
    return await this.enqueuer.enqueueMany(inputs);
  }

  public async leaseNext(
    selection: LeaseSelection,
  ): Promise<RequestLease | null> {
    const request = this.state.takeNext((candidate) =>
      selection.tryReserve(candidate),
    );
    if (request === null) return null;
    try {
      return await this.leases.lease(request);
    } catch (caught) {
      selection.releaseReservation(request);
      this.state.requeue(request);
      throw caught;
    }
  }

  public nextDeferredAt(): number | null {
    return this.state.nextDeferredAt();
  }

  public stateRecord(
    request: CrawlRequest,
    state: RequestState,
    reason: string | null,
  ): RequestStateRecord {
    return this.leases.stateRecord(request, state, reason);
  }

  public async renewLease(lease: RequestLease): Promise<RequestLease> {
    return await this.leases.renew(lease);
  }

  public async release(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    const record = await this.leases.release(lease, reason);
    this.state.requeue(lease.request);
    return record;
  }

  public async markHandled(lease: RequestLease): Promise<RequestStateRecord> {
    return await this.leases.finish(lease, "handled", null);
  }

  public async markFailed(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return await this.leases.finish(lease, "failed", reason);
  }

  public async markSkipped(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return await this.leases.finish(lease, "skipped", reason);
  }

  public async markCancelled(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return await this.leases.finish(lease, "cancelled", reason);
  }

  public async flush(): Promise<void> {
    await this.journal.flush();
  }

  public async close(): Promise<void> {
    await this.journal.close();
  }

  private restorePending(request: CrawlRequest): void {
    this.state.addPending(request);
    this.leases.restorePending(request);
  }
}

function emptySnapshot(): FrontierSnapshot {
  return { resumedRequests: 0, recoveredLeases: 0, deferredLeases: 0 };
}
