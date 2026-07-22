import type { RuntimePlatform } from "../core/platform.js";

export type SecuritySeverity = "error" | "warning" | "info";

export interface SecurityIssue {
  readonly severity: SecuritySeverity;
  readonly code: string;
  readonly message: string;
  readonly path: string | null;
}

export interface SecurityAudit {
  readonly schemaId: "site-crawler.securityAudit";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly createdAt: string;
  readonly status: "passed" | "warning" | "failed";
  readonly issueCount: number;
  readonly issues: readonly SecurityIssue[];
}

export interface SecurityDoctorReport {
  readonly createdAt: string;
  readonly nodeVersion: string;
  readonly platform: RuntimePlatform;
  readonly issues: readonly SecurityIssue[];
}
