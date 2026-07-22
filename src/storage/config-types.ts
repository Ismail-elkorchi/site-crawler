export type ResumePolicy = "exact" | "operational";
export type ResultStorageType = "memory" | "filesystem" | "sqlite";
export type FrontierBackendType = "memory" | "journal" | "sqlite";
import type { FrontierOrder } from "../scheduling/types.js";

export interface StorageConfig {
  readonly type: ResultStorageType;
  readonly frontierBackend: FrontierBackendType;
  readonly frontierOrder: FrontierOrder;
  readonly directory: string;
  readonly sqliteFileName: string;
  readonly resumeFrom: string | null;
  readonly resumePolicy: ResumePolicy;
  readonly durableFrontier: boolean;
  readonly leaseDurationMs: number;
  readonly leaseRenewalIntervalMs: number;
  readonly lockHeartbeatMs: number;
  readonly staleLockMs: number;
  readonly storeRawHtml: boolean;
  readonly storeRawXml: boolean;
  readonly writeNdjsonExports: boolean;
  readonly writeBufferSize: number;
  readonly fsync: boolean;
}
