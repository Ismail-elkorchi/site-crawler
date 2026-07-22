import { SITE_CRAWLER_WORKER_PROTOCOL } from "../core/version.js";
import { parseCrawlRequest } from "../requests/parse.js";
import type { CrawlRequest, TerminalRequestState } from "../requests/types.js";

export type WorkerProtocolMessage =
  | WorkerHelloMessage
  | WorkerReadyMessage
  | WorkerHeartbeatMessage
  | WorkerLeaseRequestMessage
  | WorkerLeaseGrantedMessage
  | WorkerLeaseEmptyMessage
  | WorkerLeaseRenewMessage
  | WorkerRequestTerminalMessage
  | WorkerStoppingMessage
  | WorkerStoppedMessage
  | WorkerErrorMessage;

interface WorkerMessageBase {
  readonly protocolVersion: typeof SITE_CRAWLER_WORKER_PROTOCOL;
  readonly workerId: string;
  readonly runId: string;
  readonly sentAt: string;
}

export interface WorkerHelloMessage extends WorkerMessageBase {
  readonly type: "hello";
  readonly pid: number;
  readonly host: string;
  readonly capabilities: readonly string[];
}

export interface WorkerReadyMessage extends WorkerMessageBase {
  readonly type: "ready";
  readonly capacity: number;
}

export interface WorkerHeartbeatMessage extends WorkerMessageBase {
  readonly type: "heartbeat";
  readonly activeRequests: number;
  readonly completedRequests: number;
}

export interface WorkerLeaseRequestMessage extends WorkerMessageBase {
  readonly type: "lease-request";
  readonly capacity: number;
  readonly acceptedOrigins: readonly string[];
}

export interface WorkerLeaseGrantedMessage extends WorkerMessageBase {
  readonly type: "lease-granted";
  readonly leaseId: string;
  readonly expiresAt: string;
  readonly request: CrawlRequest;
}

export interface WorkerLeaseEmptyMessage extends WorkerMessageBase {
  readonly type: "lease-empty";
  readonly retryAfterMs: number;
}

export interface WorkerLeaseRenewMessage extends WorkerMessageBase {
  readonly type: "lease-renew";
  readonly leaseId: string;
  readonly requestId: string;
  readonly expiresAt: string;
}

export interface WorkerRequestTerminalMessage extends WorkerMessageBase {
  readonly type: "request-terminal";
  readonly leaseId: string;
  readonly requestId: string;
  readonly state: TerminalRequestState;
  readonly reason: string | null;
}

export interface WorkerStoppingMessage extends WorkerMessageBase {
  readonly type: "stopping";
  readonly reason: string;
}

export interface WorkerStoppedMessage extends WorkerMessageBase {
  readonly type: "stopped";
  readonly completedRequests: number;
}

export interface WorkerErrorMessage extends WorkerMessageBase {
  readonly type: "error";
  readonly code: string;
  readonly message: string;
  readonly fatal: boolean;
}

export function encodeWorkerMessage(message: WorkerProtocolMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export function parseWorkerMessage(value: unknown): WorkerProtocolMessage {
  if (!isRecord(value)) throw new Error("Worker message must be an object.");
  const base = parseBase(value);
  const type = value["type"];
  if (type === "hello") return parseHello(base, value);
  if (type === "ready") {
    return { ...base, type, capacity: integerField(value, "capacity", 1) };
  }
  if (type === "heartbeat") return parseHeartbeat(base, value);
  if (type === "lease-request") {
    return {
      ...base,
      type,
      capacity: integerField(value, "capacity", 1),
      acceptedOrigins: stringArray(value, "acceptedOrigins"),
    };
  }
  if (type === "lease-granted") {
    return {
      ...base,
      type,
      leaseId: stringField(value, "leaseId"),
      expiresAt: timestampField(value, "expiresAt"),
      request: parseCrawlRequest(value["request"]),
    };
  }
  if (type === "lease-empty") {
    return {
      ...base,
      type,
      retryAfterMs: integerField(value, "retryAfterMs", 0),
    };
  }
  if (type === "lease-renew") {
    return {
      ...base,
      type,
      leaseId: stringField(value, "leaseId"),
      requestId: stringField(value, "requestId"),
      expiresAt: timestampField(value, "expiresAt"),
    };
  }
  if (type === "request-terminal") {
    return {
      ...base,
      type,
      leaseId: stringField(value, "leaseId"),
      requestId: stringField(value, "requestId"),
      state: terminalState(value["state"]),
      reason: nullableStringField(value, "reason"),
    };
  }
  if (type === "stopping") {
    return { ...base, type, reason: stringField(value, "reason") };
  }
  if (type === "stopped") {
    return {
      ...base,
      type,
      completedRequests: integerField(value, "completedRequests", 0),
    };
  }
  if (type === "error") return parseError(base, value);
  throw new Error("Worker message type is unsupported.");
}

function parseHello(
  base: WorkerMessageBase,
  value: Readonly<Record<string, unknown>>,
): WorkerHelloMessage {
  return {
    ...base,
    type: "hello",
    pid: integerField(value, "pid", 1),
    host: stringField(value, "host"),
    capabilities: stringArray(value, "capabilities"),
  };
}

function parseHeartbeat(
  base: WorkerMessageBase,
  value: Readonly<Record<string, unknown>>,
): WorkerHeartbeatMessage {
  return {
    ...base,
    type: "heartbeat",
    activeRequests: integerField(value, "activeRequests", 0),
    completedRequests: integerField(value, "completedRequests", 0),
  };
}

function parseError(
  base: WorkerMessageBase,
  value: Readonly<Record<string, unknown>>,
): WorkerErrorMessage {
  return {
    ...base,
    type: "error",
    code: stringField(value, "code"),
    message: stringField(value, "message"),
    fatal: booleanField(value, "fatal"),
  };
}

function parseBase(
  value: Readonly<Record<string, unknown>>,
): WorkerMessageBase {
  const protocolVersion = stringField(value, "protocolVersion");
  if (protocolVersion !== SITE_CRAWLER_WORKER_PROTOCOL) {
    throw new Error(`Unsupported worker protocol: ${protocolVersion}`);
  }
  return {
    protocolVersion,
    workerId: stringField(value, "workerId"),
    runId: stringField(value, "runId"),
    sentAt: timestampField(value, "sentAt"),
  };
}

function terminalState(value: unknown): TerminalRequestState {
  if (
    value === "handled" ||
    value === "failed" ||
    value === "skipped" ||
    value === "cancelled"
  ) {
    return value;
  }
  throw new Error("Worker message terminal state is malformed.");
}

function stringField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`Worker message ${key} is malformed.`);
  }
  return field;
}

function nullableStringField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const field = value[key];
  if (field === null) return null;
  if (typeof field !== "string") {
    throw new Error(`Worker message ${key} is malformed.`);
  }
  return field;
}

function timestampField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const field = stringField(value, key);
  if (!Number.isFinite(Date.parse(field))) {
    throw new Error(`Worker message ${key} is not a timestamp.`);
  }
  return field;
}

function integerField(
  value: Readonly<Record<string, unknown>>,
  key: string,
  minimum: number,
): number {
  const field = value[key];
  if (
    !Number.isInteger(field) ||
    typeof field !== "number" ||
    field < minimum
  ) {
    throw new Error(`Worker message ${key} is malformed.`);
  }
  return field;
}

function booleanField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  const field = value[key];
  if (typeof field !== "boolean") {
    throw new Error(`Worker message ${key} is malformed.`);
  }
  return field;
}

function stringArray(
  value: Readonly<Record<string, unknown>>,
  key: string,
): readonly string[] {
  const field = value[key];
  if (
    !Array.isArray(field) ||
    !field.every((item) => typeof item === "string" && item.length > 0)
  ) {
    throw new Error(`Worker message ${key} is malformed.`);
  }
  return field.slice();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
