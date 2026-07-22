import { SqliteWorkerCoordinator } from "./coordinator.js";
import type { WorkerRecord } from "./types.js";

export interface WorkerSessionOptions {
  readonly heartbeatIntervalMs?: number;
}

export class WorkerSession {
  private readonly coordinator: SqliteWorkerCoordinator;
  private readonly workerId: string;
  private readonly runId: string;
  private readonly heartbeatIntervalMs: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private recordValue: WorkerRecord | null = null;

  public constructor(
    coordinator: SqliteWorkerCoordinator,
    workerId: string,
    runId: string,
    options: WorkerSessionOptions = {},
  ) {
    this.coordinator = coordinator;
    this.workerId = workerId;
    this.runId = runId;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000;
  }

  public start(): WorkerRecord {
    if (this.recordValue !== null)
      throw new Error("Worker session has already started.");
    this.recordValue = this.coordinator.register(this.workerId, this.runId);
    this.heartbeatTimer = setInterval(() => {
      this.coordinator.heartbeat(this.workerId);
    }, this.heartbeatIntervalMs);
    return this.recordValue;
  }

  public stop(status: "stopping" | "stopped" | "failed" = "stopped"): void {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.recordValue === null) return;
    this.coordinator.stop(this.workerId, status);
    this.recordValue = null;
  }
}
