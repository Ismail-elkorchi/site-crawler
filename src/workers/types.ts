export type WorkerStatus =
  "active" | "stopping" | "stopped" | "failed" | "stale";

export interface WorkerRecord {
  readonly schemaId: "site-crawler.workerRecord";
  readonly schemaVersion: 1;
  readonly workerId: string;
  readonly runId: string;
  readonly host: string;
  readonly pid: number;
  readonly protocolVersion: "site-crawler.worker.v1";
  readonly startedAt: string;
  readonly heartbeatAt: string;
  readonly status: WorkerStatus;
}

export interface OriginPermit {
  readonly permitId: string;
  readonly origin: string;
  readonly workerId: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

export interface AcquireOriginOptions {
  readonly maxConcurrency: number;
  readonly minDelayMs: number;
  readonly leaseDurationMs: number;
}
