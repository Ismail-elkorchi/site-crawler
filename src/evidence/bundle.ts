import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { record, stringField } from "../validation/primitives.js";
import { validatePersistedRecord } from "../contracts/catalog.js";
import type {
  EvidenceBundleFile,
  EvidenceBundleManifest,
  EvidenceBundleOptions,
} from "./types.js";
import {
  ensurePrivateDirectory,
  openPrivateFile,
} from "../core/private-files.js";

const metadataFiles = [
  "manifest.json",
  "config.resolved.json",
  "stats.json",
  "summary.md",
  "run-format.json",
  "evidence.ndjson",
] as const;

export async function createEvidenceBundle(
  runDirectory: string,
  options: EvidenceBundleOptions = {},
): Promise<EvidenceBundleManifest> {
  const source = path.resolve(runDirectory);
  const target = path.resolve(
    options.targetDirectory ?? `${source}-evidence-bundle`,
  );
  if (await exists(target)) throw new Error(`Bundle target exists: ${target}`);
  const manifest = await readManifest(source);
  await ensurePrivateDirectory(target);
  const files: EvidenceBundleFile[] = [];
  for (const fileName of metadataFiles) {
    const sourcePath = path.join(source, fileName);
    if (!(await exists(sourcePath))) continue;
    files.push(await copyFile(source, target, fileName, false));
  }
  const objectRoot = path.join(source, "evidence", "sha256");
  if (await exists(objectRoot)) {
    for (const objectPath of await collectFiles(objectRoot)) {
      const relative = path.relative(source, objectPath);
      files.push(
        await copyFile(
          source,
          target,
          relative,
          options.compressObjects === true,
        ),
      );
    }
  }
  const objectFiles = files.filter((file) =>
    file.sourcePath.startsWith(`evidence${path.sep}sha256${path.sep}`),
  );
  const result: EvidenceBundleManifest = {
    schemaId: "site-crawler.evidenceBundle",
    schemaVersion: 1,
    runId: manifest.runId,
    sourceDirectory: source,
    createdAt: manifest.finishedAt ?? manifest.startedAt,
    compressed: options.compressObjects === true,
    objectCount: objectFiles.length,
    totalBytes: objectFiles.reduce((sum, file) => sum + file.byteLength, 0),
    storedBytes: files.reduce((sum, file) => sum + file.storedByteLength, 0),
    files,
  };
  validatePersistedRecord(result);
  await writeJson(path.join(target, "bundle.json"), result);
  return result;
}

async function copyFile(
  sourceRoot: string,
  targetRoot: string,
  relativePath: string,
  compress: boolean,
): Promise<EvidenceBundleFile> {
  const source = safeJoin(sourceRoot, relativePath);
  const bytes = await fs.readFile(source);
  const digest = sha256(bytes);
  verifyObjectName(relativePath, digest);
  const bundlePath = compress ? `${relativePath}.gz` : relativePath;
  const target = safeJoin(targetRoot, bundlePath);
  const stored = compress ? gzipSync(bytes, { level: 9 }) : bytes;
  await ensurePrivateDirectory(path.dirname(target));
  const handle = await openPrivateFile(target, "w");
  try {
    await handle.writeFile(stored);
  } finally {
    await handle.close();
  }
  return {
    sourcePath: relativePath,
    bundlePath,
    sha256: digest,
    byteLength: bytes.byteLength,
    storedByteLength: stored.byteLength,
    contentEncoding: compress ? "gzip" : "identity",
  };
}

function verifyObjectName(relativePath: string, digest: string): void {
  if (!relativePath.startsWith(`evidence${path.sep}sha256${path.sep}`)) return;
  if (path.basename(relativePath) !== digest) {
    throw new Error(
      `Evidence object name does not match its digest: ${relativePath}`,
    );
  }
}

async function readManifest(directory: string): Promise<{
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
}> {
  const parsed: unknown = JSON.parse(
    await fs.readFile(path.join(directory, "manifest.json"), "utf8"),
  );
  const manifest = record(parsed, "run manifest");
  const finishedAt = manifest["finishedAt"];
  if (finishedAt !== null && typeof finishedAt !== "string") {
    throw new Error("Run manifest finishedAt is malformed.");
  }
  return {
    runId: stringField(manifest, "runId"),
    startedAt: stringField(manifest, "startedAt"),
    finishedAt,
  };
}

async function collectFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(child)));
    else if (entry.isFile()) files.push(child);
  }
  return files.sort();
}

function safeJoin(root: string, relativePath: string): string {
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes its root: ${relativePath}`);
  }
  return absolute;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJson(target: string, value: unknown): Promise<void> {
  const handle = await openPrivateFile(target, "w");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
