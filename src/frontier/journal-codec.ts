import { sha256 } from "../core/utils.js";
import { hasCurrentSchema } from "../contracts/schema-identity.js";
import { parseCrawlRequest } from "../requests/parse.js";
import type {
  FrontierJournalRecord,
  UnsequencedFrontierJournalRecord,
} from "./types.js";

export function decodeJournalRecord(
  value: unknown,
): FrontierJournalRecord | null {
  const record = objectRecord(value);
  if (
    record === null ||
    !hasCurrentSchema(record, "site-crawler.frontierJournal")
  ) {
    return null;
  }
  const sequence = integer(record["sequence"]);
  const previousChecksum = nullableString(record["previousChecksum"]);
  const checksum = stringValue(record["checksum"]);
  const createdAt = stringValue(record["createdAt"]);
  if (
    sequence === null ||
    previousChecksum === undefined ||
    checksum === null ||
    createdAt === null
  ) {
    return null;
  }
  const type = record["type"];
  if (type === "enqueued") {
    const request = tryParseRequest(record["request"]);
    return request === null
      ? null
      : {
          schemaId: "site-crawler.frontierJournal",
          schemaVersion: 1,
          sequence,
          previousChecksum,
          checksum,
          createdAt,
          type,
          request,
        };
  }
  if (type === "leased" || type === "renewed") {
    const requestId = stringValue(record["requestId"]);
    const leaseId = stringValue(record["leaseId"]);
    const expiresAt = stringValue(record["expiresAt"]);
    return requestId === null || leaseId === null || expiresAt === null
      ? null
      : {
          schemaId: "site-crawler.frontierJournal",
          schemaVersion: 1,
          sequence,
          previousChecksum,
          checksum,
          createdAt,
          type,
          requestId,
          leaseId,
          expiresAt,
        };
  }
  if (isTerminalType(type) || type === "released") {
    const requestId = stringValue(record["requestId"]);
    const leaseId = stringValue(record["leaseId"]);
    const reason = nullableString(record["reason"]);
    return requestId === null || leaseId === null || reason === undefined
      ? null
      : {
          schemaId: "site-crawler.frontierJournal",
          schemaVersion: 1,
          sequence,
          previousChecksum,
          checksum,
          createdAt,
          type,
          requestId,
          leaseId,
          reason,
        };
  }
  return null;
}

export function buildJournalRecord(
  record: UnsequencedFrontierJournalRecord,
  sequence: number,
  previousChecksum: string | null,
): FrontierJournalRecord {
  const checksum = journalChecksum(record, sequence, previousChecksum);
  return { ...record, sequence, previousChecksum, checksum };
}

function journalChecksum(
  record: UnsequencedFrontierJournalRecord,
  sequence: number,
  previousChecksum: string | null,
): string {
  return sha256(
    JSON.stringify({
      schemaId: record.schemaId,
      schemaVersion: record.schemaVersion,
      sequence,
      previousChecksum,
      type: record.type,
      createdAt: record.createdAt,
      ...payload(record),
    }),
  );
}

export function checksumFor(record: FrontierJournalRecord): string {
  return journalChecksum(
    withoutSequence(record),
    record.sequence,
    record.previousChecksum,
  );
}

function withoutSequence(
  record: FrontierJournalRecord,
): UnsequencedFrontierJournalRecord {
  if (record.type === "enqueued") {
    return {
      schemaId: record.schemaId,
      schemaVersion: record.schemaVersion,
      type: record.type,
      request: record.request,
      createdAt: record.createdAt,
    };
  }
  if (record.type === "leased" || record.type === "renewed") {
    return {
      schemaId: record.schemaId,
      schemaVersion: record.schemaVersion,
      type: record.type,
      requestId: record.requestId,
      leaseId: record.leaseId,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }
  return {
    schemaId: record.schemaId,
    schemaVersion: record.schemaVersion,
    type: record.type,
    requestId: record.requestId,
    leaseId: record.leaseId,
    reason: record.reason,
    createdAt: record.createdAt,
  };
}

function payload(record: UnsequencedFrontierJournalRecord): object {
  if (record.type === "enqueued") return { request: record.request };
  if (record.type === "leased" || record.type === "renewed") {
    return {
      requestId: record.requestId,
      leaseId: record.leaseId,
      expiresAt: record.expiresAt,
    };
  }
  return {
    requestId: record.requestId,
    leaseId: record.leaseId,
    reason: record.reason,
  };
}

function isTerminalType(
  value: unknown,
): value is "handled" | "failed" | "skipped" | "cancelled" {
  return (
    value === "handled" ||
    value === "failed" ||
    value === "skipped" ||
    value === "cancelled"
  );
}

function tryParseRequest(value: unknown) {
  try {
    return parseCrawlRequest(value);
  } catch {
    return null;
  }
}

function objectRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === "string" ? value : undefined;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}
