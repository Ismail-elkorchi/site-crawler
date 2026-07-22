import type { CrawlRequest } from "../requests/types.js";
import { checksumFor } from "./journal-codec.js";
import { FrontierJournalError } from "./journal-error.js";
import type { FrontierJournalRecord } from "./types.js";

interface RequestJournalState {
  readonly request: CrawlRequest;
  readonly terminal: boolean;
  readonly leaseId: string | null;
}

export function validateJournal(
  records: readonly FrontierJournalRecord[],
): void {
  let expectedSequence = 1;
  let previousChecksum: string | null = null;
  const states = new Map<string, RequestJournalState>();
  for (const record of records) {
    if (record.sequence !== expectedSequence) {
      throw new FrontierJournalError(
        `Frontier journal sequence ${record.sequence} does not follow ${expectedSequence - 1}.`,
      );
    }
    if (record.previousChecksum !== previousChecksum) {
      throw new FrontierJournalError(
        `Frontier journal checksum chain is invalid at sequence ${record.sequence}.`,
      );
    }
    if (checksumFor(record) !== record.checksum) {
      throw new FrontierJournalError(
        `Frontier journal record checksum is invalid at sequence ${record.sequence}.`,
      );
    }
    applyTransition(record, states);
    expectedSequence += 1;
    previousChecksum = record.checksum;
  }
}

function applyTransition(
  record: FrontierJournalRecord,
  states: Map<string, RequestJournalState>,
): void {
  if (record.type === "enqueued") {
    if (states.has(record.request.id)) {
      invalid(`Request ${record.request.id} was enqueued more than once.`);
    }
    states.set(record.request.id, {
      request: record.request,
      terminal: false,
      leaseId: null,
    });
    return;
  }
  const current = states.get(record.requestId);
  if (current === undefined) {
    invalid(
      `Transition ${record.type} references unknown request ${record.requestId}.`,
    );
  }
  if (current.terminal) {
    invalid(
      `Terminal request ${record.requestId} received transition ${record.type}.`,
    );
  }
  if (record.type === "leased") {
    if (current.leaseId !== null) invalidLease(record.requestId, record.type);
    states.set(record.requestId, { ...current, leaseId: record.leaseId });
    return;
  }
  if (record.type === "renewed") {
    if (current.leaseId !== record.leaseId) {
      invalidLease(record.requestId, record.type);
    }
    return;
  }
  if (current.leaseId !== record.leaseId) {
    invalidLease(record.requestId, record.type);
  }
  if (record.type === "released") {
    states.set(record.requestId, { ...current, leaseId: null });
    return;
  }
  states.set(record.requestId, {
    request: current.request,
    terminal: true,
    leaseId: null,
  });
}

function invalidLease(requestId: string, transition: string): never {
  return invalid(
    `Transition ${transition} has an invalid lease for request ${requestId}.`,
  );
}

function invalid(message: string): never {
  throw new FrontierJournalError(message);
}
