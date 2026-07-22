import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import type { ResponseBody } from "./body-types.js";
import {
  ensurePrivateDirectory,
  openPrivateFile,
} from "../core/private-files.js";

export class BodyCollector extends Writable {
  public bytesRead = 0;
  private readonly chunks: Buffer[] = [];
  private readonly maxBytes: number;
  private readonly memoryThresholdBytes: number;
  private readonly directory: string;
  private readonly requestId: string;
  private fileHandle: fs.FileHandle | null = null;
  private filePath: string | null = null;

  public constructor(
    maxBytes: number,
    memoryThresholdBytes: number,
    spoolDirectory: string | null,
    requestId: string,
  ) {
    super();
    this.maxBytes = maxBytes;
    this.memoryThresholdBytes = memoryThresholdBytes;
    this.directory =
      spoolDirectory ?? path.join(os.tmpdir(), "site-crawler-bodies");
    this.requestId = requestId;
  }

  public override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.writeChunk(chunk).then(
      () => callback(),
      (caught: unknown) =>
        callback(
          caught instanceof Error ? caught : new Error("Body write failed."),
        ),
    );
  }

  public override _final(callback: (error?: Error | null) => void): void {
    this.closeFile().then(
      () => callback(),
      (caught: unknown) =>
        callback(
          caught instanceof Error ? caught : new Error("Body close failed."),
        ),
    );
  }

  public async discard(): Promise<void> {
    await this.closeFile();
    if (this.filePath !== null) await fs.rm(this.filePath, { force: true });
    this.filePath = null;
    this.chunks.length = 0;
  }

  public body(): ResponseBody {
    if (this.filePath !== null) {
      return {
        kind: "file",
        path: this.filePath,
        size: this.bytesRead,
        temporary: true,
      };
    }
    const bytes = Buffer.concat(this.chunks, this.bytesRead);
    return { kind: "memory", bytes, size: bytes.byteLength };
  }

  private async writeChunk(chunk: Buffer): Promise<void> {
    this.bytesRead += chunk.byteLength;
    if (this.bytesRead > this.maxBytes)
      throw new BodyLimitError("decompressed", this.maxBytes);
    if (
      this.fileHandle === null &&
      this.bytesRead <= this.memoryThresholdBytes
    ) {
      this.chunks.push(Buffer.from(chunk));
      return;
    }
    const handle = await this.ensureFile();
    await handle.write(chunk);
  }

  private async ensureFile(): Promise<fs.FileHandle> {
    if (this.fileHandle !== null) return this.fileHandle;
    await ensurePrivateDirectory(this.directory);
    const name = `${safeName(this.requestId)}-${process.pid}-${randomUUID()}.body`;
    this.filePath = path.join(this.directory, name);
    this.fileHandle = await openPrivateFile(this.filePath, "wx");
    for (const chunk of this.chunks) await this.fileHandle.write(chunk);
    this.chunks.length = 0;
    return this.fileHandle;
  }

  private async closeFile(): Promise<void> {
    if (this.fileHandle === null) return;
    await this.fileHandle.close();
    this.fileHandle = null;
  }
}

export class BodyLimitError extends Error {
  public override readonly name = "BodyLimitError";
  public readonly kind: "compressed" | "decompressed";

  public constructor(kind: "compressed" | "decompressed", limit: number) {
    super(`${kind} response body exceeded ${limit} bytes.`);
    this.kind = kind;
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/gu, "_");
}
