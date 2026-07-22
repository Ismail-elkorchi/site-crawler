import type { RuntimePlatform } from "../core/platform.js";

export interface RunInspection {
  readonly schemaId: "site-crawler.runInspection";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly directory: string;
  readonly createdAt: string;
  readonly manifest: unknown;
  readonly counts: Readonly<Record<string, number>>;
  readonly files: readonly string[];
}

export type ValidationSeverity = "error" | "warning";

export interface RunValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly path: string | null;
}

export interface RunValidation {
  readonly schemaId: "site-crawler.runValidation";
  readonly schemaVersion: 1;
  readonly directory: string;
  readonly createdAt: string;
  readonly valid: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly issues: readonly RunValidationIssue[];
}

export interface CheckpointRecord {
  readonly schemaId: "site-crawler.checkpoint";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly createdAt: string;
  readonly sequence: number;
  readonly frontierBackend: "memory" | "journal" | "sqlite";
  readonly counts: Readonly<Record<string, number>>;
}

export interface DoctorReport {
  readonly crawlerVersion: string;
  readonly nodeVersion: string;
  readonly platform: RuntimePlatform;
  readonly architecture: string;
  readonly sqlite: boolean;
  readonly playwright: boolean;
  readonly htmlParserVersion: string | null;
  readonly xmlParserVersion: string | null;
  readonly issues: readonly string[];
}
