import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ensurePrivateDirectory,
  protectPrivateFile,
} from "../core/private-files.js";
import { resolvePortableRelativePath } from "../core/portable-path.js";
import type {
  EvidenceKind,
  EvidenceReference,
  EvidenceWriteResult,
} from "./types.js";
import { parseEvidenceReference } from "./parse.js";

export class ContentAddressedEvidenceStore {
  private readonly rootDirectory: string;

  public constructor(rootDirectory: string) {
    this.rootDirectory = path.resolve(rootDirectory);
  }

  public async init(): Promise<void> {
    await ensurePrivateDirectory(this.objectRoot());
  }

  public async writeBytes(
    kind: EvidenceKind,
    mediaType: string,
    content: Uint8Array,
  ): Promise<EvidenceWriteResult> {
    const digest = createHash("sha256").update(content).digest("hex");
    const relativePath = this.relativeObjectPath(digest);
    const absolutePath = this.safeAbsolutePath(relativePath);
    await ensurePrivateDirectory(path.dirname(absolutePath));
    const created = await writeOnce(absolutePath, content);
    return {
      reference: {
        schemaId: "site-crawler.evidenceReference",
        schemaVersion: 1,
        algorithm: "sha256",
        digest,
        kind,
        mediaType,
        byteLength: content.byteLength,
        capture: {
          kind: "complete",
          sourceByteLength: content.byteLength,
        },
        relativePath,
        createdAt: new Date().toISOString(),
      },
      created,
    };
  }

  public async read(reference: EvidenceReference): Promise<Uint8Array> {
    const validated = parseEvidenceReference(reference);
    const absolutePath = this.objectPath(validated);
    const bytes = await fs.readFile(absolutePath);
    if (bytes.byteLength !== validated.byteLength) {
      throw new Error(
        `Evidence byte length mismatch for ${validated.relativePath}.`,
      );
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== validated.digest) {
      throw new Error(
        `Evidence digest mismatch for ${validated.relativePath}.`,
      );
    }
    return bytes;
  }

  public absolutePath(reference: EvidenceReference): string {
    return this.objectPath(parseEvidenceReference(reference));
  }

  private objectRoot(): string {
    return path.join(this.rootDirectory, "evidence", "sha256");
  }

  private relativeObjectPath(digest: string): string {
    return `evidence/sha256/${digest.slice(0, 2)}/${digest}`;
  }

  private objectPath(reference: EvidenceReference): string {
    const expected = this.relativeObjectPath(reference.digest);
    if (reference.relativePath !== expected) {
      throw new Error("Evidence path does not match its digest.");
    }
    return this.safeAbsolutePath(reference.relativePath);
  }

  private safeAbsolutePath(relativePath: string): string {
    return resolvePortableRelativePath(this.rootDirectory, relativePath);
  }
}

async function writeOnce(
  target: string,
  content: Uint8Array,
): Promise<boolean> {
  try {
    await fs.writeFile(target, content, { flag: "wx", mode: 0o600 });
    return true;
  } catch (caught) {
    if (isAlreadyExists(caught)) {
      const existing = await fs.readFile(target);
      if (
        existing.byteLength !== content.byteLength ||
        !existing.every((byte, index) => byte === content[index])
      ) {
        throw new Error(`Existing evidence object is corrupt: ${target}`);
      }
      await protectPrivateFile(target);
      return false;
    }
    throw caught;
  }
}

function isAlreadyExists(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return "code" in value && value.code === "EEXIST";
}
