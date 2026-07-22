import type { ResolvedCrawlConfig } from "../config/types.js";
import type {
  CrawlRequest,
  RequestState,
  RequestStateRecord,
} from "../requests/types.js";
import type { FrontierBackend, LeaseSelection } from "./backend-types.js";
import { JournalFrontierBackend } from "./backends/journal-backend.js";
import { SqliteFrontierBackend } from "./backends/sqlite-backend.js";
import {
  resolveFrontierDatabasePath,
  resolveFrontierOutputDirectory,
} from "./frontier-helpers.js";
import { RunLock } from "./run-lock.js";
import type {
  EnqueueInput,
  EnqueueResult,
  FrontierSnapshot,
  RequestLease,
  SeedRequestCount,
} from "./types.js";

const unrestrictedSelection: LeaseSelection = {
  tryReserve: () => true,
  releaseReservation: () => undefined,
};

export class Frontier {
  private readonly backend: FrontierBackend;
  private readonly lock: RunLock;

  public constructor(runId: string, config: ResolvedCrawlConfig) {
    this.backend = createBackend(runId, config);
    this.lock = new RunLock(
      runId,
      resolveFrontierOutputDirectory(runId, config),
      config.storage.lockHeartbeatMs,
      config.storage.staleLockMs,
    );
  }

  public get size(): number {
    return this.backend.size;
  }

  public get outstandingCount(): number {
    return this.backend.outstandingCount;
  }

  public requestForKey(uniqueKey: string): CrawlRequest | null {
    return this.backend.requestForKey(uniqueKey);
  }

  public seedRequestCounts(): readonly SeedRequestCount[] {
    return this.backend.seedRequestCounts();
  }

  public knownRequests(): readonly CrawlRequest[] {
    return this.backend.knownRequests();
  }

  public async init(): Promise<FrontierSnapshot> {
    await this.lock.acquire();
    try {
      return await this.backend.init();
    } catch (caught) {
      await this.lock.release();
      throw caught;
    }
  }

  public async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    return await this.backend.enqueue(input);
  }

  public async enqueueMany(
    inputs: readonly EnqueueInput[],
  ): Promise<readonly EnqueueResult[]> {
    return await this.backend.enqueueMany(inputs);
  }

  public async leaseNext(
    selection: LeaseSelection = unrestrictedSelection,
  ): Promise<RequestLease | null> {
    return await this.backend.leaseNext(selection);
  }

  public nextDeferredAt(): number | null {
    return this.backend.nextDeferredAt();
  }

  public stateRecord(
    request: CrawlRequest,
    state: RequestState,
    reason: string | null,
  ): RequestStateRecord {
    return this.backend.stateRecord(request, state, reason);
  }

  public async renewLease(lease: RequestLease): Promise<RequestLease> {
    return await this.backend.renewLease(lease);
  }

  public async release(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return await this.backend.release(lease, reason);
  }

  public async markHandled(lease: RequestLease): Promise<RequestStateRecord> {
    return await this.backend.markHandled(lease);
  }

  public async markFailed(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return await this.backend.markFailed(lease, reason);
  }

  public async markSkipped(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return await this.backend.markSkipped(lease, reason);
  }

  public async markCancelled(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord> {
    return await this.backend.markCancelled(lease, reason);
  }

  public async flush(): Promise<void> {
    await this.backend.flush();
  }

  public async close(): Promise<void> {
    const results = await Promise.allSettled([
      this.backend.close(),
      this.lock.release(),
    ]);
    const errors = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    if (errors.length > 0)
      throw new AggregateError(errors, "Frontier close failed.");
  }
}

function createBackend(
  runId: string,
  config: ResolvedCrawlConfig,
): FrontierBackend {
  if (config.storage.frontierBackend !== "sqlite") {
    return new JournalFrontierBackend(runId, config);
  }
  const databasePath = resolveFrontierDatabasePath(runId, config);
  if (databasePath === null)
    throw new Error("SQLite frontier requires durable filesystem storage.");
  return new SqliteFrontierBackend(runId, config, databasePath);
}
