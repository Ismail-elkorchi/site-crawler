import type {
  CrawlRequest,
  RequestState,
  RequestStateRecord,
} from "../requests/types.js";
import type {
  EnqueueInput,
  EnqueueResult,
  FrontierSnapshot,
  RequestLease,
  SeedRequestCount,
} from "./types.js";

export interface LeaseSelection {
  tryReserve(request: CrawlRequest): boolean;
  releaseReservation(request: CrawlRequest): void;
}

export interface FrontierBackend {
  readonly size: number;
  readonly outstandingCount: number;
  requestForKey(uniqueKey: string): CrawlRequest | null;
  seedRequestCounts(): readonly SeedRequestCount[];
  knownRequests(): readonly CrawlRequest[];
  init(): Promise<FrontierSnapshot>;
  enqueue(input: EnqueueInput): Promise<EnqueueResult>;
  enqueueMany(
    inputs: readonly EnqueueInput[],
  ): Promise<readonly EnqueueResult[]>;
  leaseNext(selection: LeaseSelection): Promise<RequestLease | null>;
  nextDeferredAt(): number | null;
  stateRecord(
    request: CrawlRequest,
    state: RequestState,
    reason: string | null,
  ): RequestStateRecord;
  renewLease(lease: RequestLease): Promise<RequestLease>;
  release(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord>;
  markHandled(lease: RequestLease): Promise<RequestStateRecord>;
  markFailed(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord>;
  markSkipped(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord>;
  markCancelled(
    lease: RequestLease,
    reason: string | null,
  ): Promise<RequestStateRecord>;
  flush(): Promise<void>;
  close(): Promise<void>;
}
