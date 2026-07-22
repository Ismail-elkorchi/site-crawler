import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseRunManifest } from "../crawler/resume-schema.js";
import { ContentAddressedEvidenceStore } from "../evidence/content-addressed-store.js";
import { parseEvidenceReference } from "../evidence/parse.js";
import type { SecurityAudit, SecurityIssue } from "./types.js";

const sensitiveNames = new Set([
  "config.resolved.json",
  "cookies.json",
  "manifest.json",
]);

export async function auditRunSecurity(
  runDirectory: string,
): Promise<SecurityAudit> {
  const directory = path.resolve(runDirectory);
  const issues: SecurityIssue[] = [];
  const manifest = parseRunManifest(
    await fs.readFile(path.join(directory, "manifest.json"), "utf8"),
  );
  await inspectTree(directory, directory, issues);
  await inspectDatabases(directory, issues);
  await inspectEvidence(directory, issues);
  const errors = issues.filter((item) => item.severity === "error").length;
  const warnings = issues.filter((item) => item.severity === "warning").length;
  return {
    schemaId: "site-crawler.securityAudit",
    schemaVersion: 1,
    runId: manifest.runId,
    createdAt: new Date().toISOString(),
    status: errors > 0 ? "failed" : warnings > 0 ? "warning" : "passed",
    issueCount: issues.length,
    issues,
  };
}

async function inspectTree(
  root: string,
  directory: string,
  issues: SecurityIssue[],
): Promise<void> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const relative = path.relative(root, target);
    if (entry.isSymbolicLink()) {
      issues.push(
        issue(
          "error",
          "SYMLINK_IN_RUN",
          "Run directories must not contain symbolic links.",
          relative,
        ),
      );
      continue;
    }
    if (entry.isDirectory()) {
      await inspectTree(root, target, issues);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!isPathInside(root, target)) {
      issues.push(
        issue(
          "error",
          "PATH_ESCAPE",
          "Run file escapes the run directory.",
          relative,
        ),
      );
    }
    if (process.platform !== "win32" && sensitiveNames.has(entry.name)) {
      const mode = (await fs.stat(target)).mode & 0o777;
      if ((mode & 0o077) !== 0) {
        issues.push(
          issue(
            "warning",
            "PERMISSIVE_FILE_MODE",
            `Sensitive file mode is ${mode.toString(8)}.`,
            relative,
          ),
        );
      }
    }
  }
}

async function inspectDatabases(
  directory: string,
  issues: SecurityIssue[],
): Promise<void> {
  for (const fileName of [
    "crawl.sqlite",
    "frontier.sqlite",
    "coordination.sqlite",
  ] as const) {
    const target = path.join(directory, fileName);
    if (!(await exists(target))) continue;
    let database: DatabaseSync | null = null;
    try {
      database = new DatabaseSync(target, { readOnly: true });
      database.exec("PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;");
      const row = database.prepare("PRAGMA integrity_check").get();
      if (!integrityCheckPassed(row)) {
        issues.push(
          issue(
            "error",
            "SQLITE_INTEGRITY",
            "SQLite integrity check failed.",
            fileName,
          ),
        );
      }
    } catch (caught) {
      issues.push(
        issue("error", "SQLITE_UNREADABLE", message(caught), fileName),
      );
    } finally {
      database?.close();
    }
  }
}

async function inspectEvidence(
  directory: string,
  issues: SecurityIssue[],
): Promise<void> {
  const associationFile = path.join(directory, "evidence.ndjson");
  if (!(await exists(associationFile))) return;
  try {
    const content = await fs.readFile(associationFile, "utf8");
    const store = new ContentAddressedEvidenceStore(directory);
    for (const [index, line] of content.split("\n").entries()) {
      if (line.trim().length === 0) continue;
      try {
        const value: unknown = JSON.parse(line);
        if (!isRecord(value)) {
          throw new Error("Evidence association must be an object.");
        }
        await store.read(parseEvidenceReference(value["reference"]));
      } catch (caught) {
        issues.push(
          issue(
            "error",
            "EVIDENCE_INTEGRITY",
            message(caught),
            `evidence.ndjson:${index + 1}`,
          ),
        );
      }
    }
  } catch (caught) {
    issues.push(
      issue(
        "warning",
        "EVIDENCE_INDEX_UNREADABLE",
        message(caught),
        "evidence.ndjson",
      ),
    );
  }
}

function integrityCheckPassed(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).some((entry) => entry === "ok");
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative.length === 0 ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function issue(
  severity: SecurityIssue["severity"],
  code: string,
  messageValue: string,
  issuePath: string | null,
): SecurityIssue {
  return { severity, code, message: messageValue, path: issuePath };
}

function message(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
