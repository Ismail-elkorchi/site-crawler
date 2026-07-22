import type { EnqueueDecision } from "../links/types.js";
import type {
  CrawlRequest,
  CrawlSource,
  DiscoveryRecord,
  RequestStateRecord,
  ResolvedSeed,
} from "../requests/types.js";
import type { SkippedUrl } from "../results/types.js";

export interface EnqueueInput {
  readonly rawUrl: string;
  readonly referrerUrl: string | null;
  readonly source: CrawlSource;
  readonly depth: number;
  readonly sitemapIndexDepth?: number;
  readonly sitemapAncestors?: readonly string[];
  readonly seed: ResolvedSeed;
}

export interface EnqueueResult {
  readonly decision: EnqueueDecision;
  readonly request: CrawlRequest | null;
  readonly skipped: SkippedUrl | null;
  readonly discovery: DiscoveryRecord | null;
  readonly state: RequestStateRecord | null;
}

export interface RequestLease {
  readonly leaseId: string;
  readonly request: CrawlRequest;
  readonly leasedAt: string;
  readonly expiresAt: string;
}

export interface FrontierSnapshot {
  readonly resumedRequests: number;
  readonly recoveredLeases: number;
  readonly deferredLeases: number;
}

export interface SeedRequestCount {
  readonly seedUrl: string;
  readonly count: number;
}

export type { FrontierOrder } from "../scheduling/types.js";
export type TerminalRequestState =
  "handled" | "failed" | "skipped" | "cancelled";

interface JournalBase {
  readonly schemaId: "site-crawler.frontierJournal";
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly previousChecksum: string | null;
  readonly checksum: string;
  readonly createdAt: string;
}

type JournalLeaseRecord<T extends "leased" | "renewed"> = JournalBase & {
  readonly type: T;
  readonly requestId: string;
  readonly leaseId: string;
  readonly expiresAt: string;
};

type JournalTerminalRecord<T extends TerminalRequestState | "released"> =
  JournalBase & {
    readonly type: T;
    readonly requestId: string;
    readonly leaseId: string;
    readonly reason: string | null;
  };

export type FrontierJournalRecord =
  | (JournalBase & {
      readonly type: "enqueued";
      readonly request: CrawlRequest;
    })
  | JournalLeaseRecord<"leased">
  | JournalLeaseRecord<"renewed">
  | JournalTerminalRecord<"handled">
  | JournalTerminalRecord<"failed">
  | JournalTerminalRecord<"skipped">
  | JournalTerminalRecord<"cancelled">
  | JournalTerminalRecord<"released">;

interface UnsequencedJournalBase {
  readonly schemaId: "site-crawler.frontierJournal";
  readonly schemaVersion: 1;
  readonly createdAt: string;
}

type UnsequencedLeaseRecord<T extends "leased" | "renewed"> =
  UnsequencedJournalBase & {
    readonly type: T;
    readonly requestId: string;
    readonly leaseId: string;
    readonly expiresAt: string;
  };

type UnsequencedTerminalRecord<T extends TerminalRequestState | "released"> =
  UnsequencedJournalBase & {
    readonly type: T;
    readonly requestId: string;
    readonly leaseId: string;
    readonly reason: string | null;
  };

export type UnsequencedFrontierJournalRecord =
  | (UnsequencedJournalBase & {
      readonly type: "enqueued";
      readonly request: CrawlRequest;
    })
  | UnsequencedLeaseRecord<"leased">
  | UnsequencedLeaseRecord<"renewed">
  | UnsequencedTerminalRecord<"handled">
  | UnsequencedTerminalRecord<"failed">
  | UnsequencedTerminalRecord<"skipped">
  | UnsequencedTerminalRecord<"cancelled">
  | UnsequencedTerminalRecord<"released">;
