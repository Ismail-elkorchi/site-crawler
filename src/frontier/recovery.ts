import type { CrawlRequest } from "../requests/types.js";
import type { FrontierJournalRecord } from "./types.js";

export interface DeferredRequest {
  readonly request: CrawlRequest;
  readonly expiresAt: string;
}

export interface RecoveredFrontier {
  readonly requests: readonly CrawlRequest[];
  readonly pending: readonly CrawlRequest[];
  readonly deferred: readonly DeferredRequest[];
  readonly recoveredLeases: number;
}

interface RecoveryState {
  readonly request: CrawlRequest;
  readonly terminal: boolean;
  readonly leaseExpiresAt: string | null;
}

export function recoverFrontier(
  records: readonly FrontierJournalRecord[],
  nowMs: number = Date.now(),
): RecoveredFrontier {
  const states = new Map<string, RecoveryState>();
  for (const record of records) {
    if (record.type === "enqueued") {
      states.set(record.request.id, {
        request: record.request,
        terminal: false,
        leaseExpiresAt: null,
      });
      continue;
    }
    const current = states.get(record.requestId);
    if (current === undefined) continue;
    if (record.type === "leased" || record.type === "renewed") {
      states.set(record.requestId, {
        ...current,
        leaseExpiresAt: record.expiresAt,
      });
      continue;
    }
    if (record.type === "released") {
      states.set(record.requestId, { ...current, leaseExpiresAt: null });
      continue;
    }
    states.set(record.requestId, {
      request: current.request,
      terminal: true,
      leaseExpiresAt: null,
    });
  }
  const requests = [...states.values()].map((state) => state.request);
  const pending: CrawlRequest[] = [];
  const deferred: DeferredRequest[] = [];
  let recoveredLeases = 0;
  for (const state of states.values()) {
    if (state.terminal) continue;
    if (state.leaseExpiresAt === null) {
      pending.push(state.request);
      continue;
    }
    if (Date.parse(state.leaseExpiresAt) <= nowMs) {
      pending.push(state.request);
      recoveredLeases += 1;
      continue;
    }
    deferred.push({ request: state.request, expiresAt: state.leaseExpiresAt });
  }
  return { requests, pending, deferred, recoveredLeases };
}
