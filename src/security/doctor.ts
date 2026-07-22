import type { SecurityDoctorReport, SecurityIssue } from "./types.js";

export function runSecurityDoctor(): SecurityDoctorReport {
  const issues: SecurityIssue[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < 24) {
    issues.push({
      severity: "error",
      code: "UNSUPPORTED_NODE",
      message: "Node.js 24 or newer is required.",
      path: null,
    });
  }
  if (process.env["NODE_OPTIONS"]?.includes("--no-addons") === true) {
    issues.push({
      severity: "info",
      code: "NATIVE_ADDONS_DISABLED",
      message:
        "Native addons are disabled; the built-in SQLite module remains available.",
      path: null,
    });
  }
  return {
    createdAt: new Date().toISOString(),
    nodeVersion: process.versions.node,
    platform: process.platform,
    issues,
  };
}
