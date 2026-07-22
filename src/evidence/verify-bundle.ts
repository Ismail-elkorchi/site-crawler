import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { hasCurrentSchema } from "../contracts/schema-identity.js";
import {
  resolvePortableRelativePath,
  validatePortableRelativePath,
} from "../core/portable-path.js";
import type {
  EvidenceBundleFile,
  EvidenceBundleManifest,
  EvidenceBundleVerification,
  EvidenceBundleVerificationIssue,
} from "./types.js";

const gunzipAsync = promisify(gunzip);

export async function verifyEvidenceBundle(
  bundleDirectory: string,
): Promise<EvidenceBundleVerification> {
  const directory = path.resolve(bundleDirectory);
  const issues: EvidenceBundleVerificationIssue[] = [];
  let verifiedFiles = 0;
  let manifest: EvidenceBundleManifest | null = null;
  try {
    manifest = parseBundleManifest(
      JSON.parse(
        await fs.readFile(path.join(directory, "bundle.json"), "utf8"),
      ),
    );
  } catch (caught) {
    issues.push(
      issue("BUNDLE_MANIFEST_INVALID", message(caught), "bundle.json"),
    );
  }
  if (manifest !== null) {
    const listed = new Set(["bundle.json"]);
    for (const file of manifest.files) {
      listed.add(file.bundlePath);
      if (await verifyFile(directory, file, issues)) verifiedFiles += 1;
    }
    await inspectUnlistedFiles(directory, directory, listed, issues);
  }
  return {
    schemaId: "site-crawler.evidenceBundleVerification",
    schemaVersion: 1,
    bundleDirectory: directory,
    verifiedAt: new Date().toISOString(),
    valid: issues.length === 0,
    verifiedFiles,
    issues,
  };
}

async function verifyFile(
  directory: string,
  file: EvidenceBundleFile,
  issues: EvidenceBundleVerificationIssue[],
): Promise<boolean> {
  let target: string;
  try {
    target = resolvePortableRelativePath(directory, file.bundlePath);
  } catch (caught) {
    issues.push(issue("BUNDLE_PATH_ESCAPE", message(caught), file.bundlePath));
    return false;
  }
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error("Bundle member is not a regular file.");
    }
    const stored = await fs.readFile(target);
    if (stored.byteLength !== file.storedByteLength) {
      throw new Error(
        `Stored length ${stored.byteLength} does not match ${file.storedByteLength}.`,
      );
    }
    const decoded =
      file.contentEncoding === "gzip" ? await gunzipAsync(stored) : stored;
    if (decoded.byteLength !== file.byteLength) {
      throw new Error(
        `Decoded length ${decoded.byteLength} does not match ${file.byteLength}.`,
      );
    }
    const digest = sha256(decoded);
    if (digest !== file.sha256) {
      throw new Error(`Digest ${digest} does not match ${file.sha256}.`);
    }
    verifyObjectName(file.sourcePath, digest);
    return true;
  } catch (caught) {
    issues.push(issue("BUNDLE_FILE_INVALID", message(caught), file.bundlePath));
    return false;
  }
}

async function inspectUnlistedFiles(
  root: string,
  directory: string,
  listed: ReadonlySet<string>,
  issues: EvidenceBundleVerificationIssue[],
): Promise<void> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const relative = normalizeRelative(path.relative(root, target));
    if (entry.isSymbolicLink()) {
      issues.push(
        issue(
          "BUNDLE_SYMLINK",
          "Bundles must not contain symbolic links.",
          relative,
        ),
      );
      continue;
    }
    if (entry.isDirectory()) {
      await inspectUnlistedFiles(root, target, listed, issues);
    } else if (entry.isFile() && !listed.has(relative)) {
      issues.push(
        issue(
          "BUNDLE_UNLISTED_FILE",
          "Bundle contains an unlisted file.",
          relative,
        ),
      );
    }
  }
}

function parseBundleManifest(value: unknown): EvidenceBundleManifest {
  if (
    !isRecord(value) ||
    !hasCurrentSchema(value, "site-crawler.evidenceBundle")
  ) {
    throw new Error("Evidence bundle manifest schema is unsupported.");
  }
  const files = value["files"];
  if (!Array.isArray(files))
    throw new Error("Evidence bundle files are malformed.");
  return {
    schemaId: "site-crawler.evidenceBundle",
    schemaVersion: 1,
    runId: stringField(value, "runId"),
    sourceDirectory: stringField(value, "sourceDirectory"),
    createdAt: stringField(value, "createdAt"),
    compressed: booleanField(value, "compressed"),
    objectCount: integerField(value, "objectCount"),
    totalBytes: integerField(value, "totalBytes"),
    storedBytes: integerField(value, "storedBytes"),
    files: files.map(parseBundleFile),
  };
}

function parseBundleFile(value: unknown): EvidenceBundleFile {
  if (!isRecord(value)) throw new Error("Evidence bundle file is malformed.");
  const contentEncoding = value["contentEncoding"];
  if (contentEncoding !== "identity" && contentEncoding !== "gzip") {
    throw new Error("Evidence bundle content encoding is unsupported.");
  }
  return {
    sourcePath: validatePortableRelativePath(stringField(value, "sourcePath")),
    bundlePath: validatePortableRelativePath(stringField(value, "bundlePath")),
    sha256: digestField(value, "sha256"),
    byteLength: integerField(value, "byteLength"),
    storedByteLength: integerField(value, "storedByteLength"),
    contentEncoding,
  };
}

function verifyObjectName(relativePath: string, digest: string): void {
  if (!relativePath.startsWith("evidence/sha256/")) return;
  if (path.posix.basename(relativePath) !== digest) {
    throw new Error(`Content-addressed object name does not match ${digest}.`);
  }
}

function normalizeRelative(value: string): string {
  return value.split(path.sep).join("/");
}

function digestField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const field = stringField(value, key);
  if (!/^[a-f0-9]{64}$/u.test(field))
    throw new Error(`${key} is not a SHA-256 digest.`);
  return field;
}

function stringField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0)
    throw new Error(`${key} is malformed.`);
  return field;
}

function integerField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isSafeInteger(field) || field < 0) {
    throw new Error(`${key} is malformed.`);
  }
  return field;
}

function booleanField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  const field = value[key];
  if (typeof field !== "boolean") throw new Error(`${key} is malformed.`);
  return field;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function issue(
  code: string,
  messageValue: string,
  issuePath: string | null,
): EvidenceBundleVerificationIssue {
  return { code, message: messageValue, path: issuePath };
}

function message(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
