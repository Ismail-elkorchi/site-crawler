import fs from "node:fs/promises";
import path from "node:path";
import { runtimeContracts } from "../contracts/catalog.js";
import { parseRunManifest } from "../crawler/resume-schema.js";
import { ContentAddressedEvidenceStore } from "../evidence/content-addressed-store.js";
import { parseEvidenceReference } from "../evidence/parse.js";
import { openRunReader } from "../runs/reader.js";
import type { CrawlRecordKind } from "../storage/types.js";
import type { RunValidation, RunValidationIssue } from "./types.js";

const recordContracts: readonly [CrawlRecordKind, string][] = [
  ["request", "crawl-request"],
  ["request-state", "request-state"],
  ["discovery", "discovery-record"],
  ["resource", "crawled-resource"],
  ["html-page", "html-page"],
  ["xml-resource", "xml-resource"],
  ["link", "link-edge"],
  ["skipped", "skipped-url"],
  ["error", "crawl-error"],
  ["robots", "robots-record"],
  ["sitemap-entry", "sitemap-entry"],
  ["feed-entry", "feed-entry"],
];

export async function validateRun(
  runDirectory: string,
): Promise<RunValidation> {
  const directory = path.resolve(runDirectory);
  const issues: RunValidationIssue[] = [];
  await validateManifest(directory, issues);
  await validateRecords(directory, issues);
  await validateEvidence(directory, issues);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return {
    schemaId: "site-crawler.runValidation",
    schemaVersion: 1,
    directory,
    createdAt: new Date().toISOString(),
    valid: errors === 0,
    errorCount: errors,
    warningCount: warnings,
    issues,
  };
}

async function validateManifest(
  directory: string,
  issues: RunValidationIssue[],
): Promise<void> {
  try {
    const text = await fs.readFile(
      path.join(directory, "manifest.json"),
      "utf8",
    );
    parseRunManifest(text);
  } catch (caught) {
    issues.push(
      issue("error", "MANIFEST_INVALID", message(caught), "manifest.json"),
    );
  }
}

async function validateRecords(
  directory: string,
  issues: RunValidationIssue[],
): Promise<void> {
  const reader = await openRunReader(directory);
  const contracts = new Map(runtimeContracts.map((item) => [item.name, item]));
  try {
    for (const [kind, contractName] of recordContracts) {
      const contract = contracts.get(contractName);
      if (contract === undefined) continue;
      for await (const item of reader.records(kind)) {
        if (!contract.is(item.data)) {
          issues.push(
            issue(
              "error",
              "RECORD_INVALID",
              `${kind} record ${item.recordId} is invalid.`,
              kind,
            ),
          );
        }
      }
    }
  } finally {
    await reader.close();
  }
}

async function validateEvidence(
  directory: string,
  issues: RunValidationIssue[],
): Promise<void> {
  const evidenceFile = path.join(directory, "evidence.ndjson");
  try {
    const text = await fs.readFile(evidenceFile, "utf8");
    const store = new ContentAddressedEvidenceStore(directory);
    for (const [index, line] of text.split("\n").entries()) {
      if (line.trim().length === 0) continue;
      try {
        const parsed: unknown = JSON.parse(line);
        if (!isRecord(parsed))
          throw new Error("Association must be an object.");
        await store.read(parseEvidenceReference(parsed["reference"]));
      } catch (caught) {
        issues.push(
          issue(
            "error",
            "EVIDENCE_INVALID",
            message(caught),
            `evidence.ndjson:${index + 1}`,
          ),
        );
      }
    }
  } catch (caught) {
    if (!isMissing(caught)) {
      issues.push(
        issue(
          "warning",
          "EVIDENCE_UNREADABLE",
          message(caught),
          "evidence.ndjson",
        ),
      );
    }
  }
}

function issue(
  severity: "error" | "warning",
  code: string,
  messageValue: string,
  issuePath: string | null,
): RunValidationIssue {
  return { severity, code, message: messageValue, path: issuePath };
}

function message(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function isMissing(value: unknown): boolean {
  return isRecord(value) && value["code"] === "ENOENT";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
