import type { FileHandle } from "node:fs/promises";
import { openPrivateFile } from "../core/private-files.js";
export class JsonLineSink {
  private readonly buffer: string[] = [];
  private handle: FileHandle | null = null;
  private flushing: Promise<void> | null = null;
  private closed = false;
  private readonly filePath: string;
  private readonly flushEveryRecords: number;
  private readonly syncOnFlush: boolean;
  private readonly onBackpressure: (pendingRecords: number) => void;
  public constructor(
    filePath: string,
    flushEveryRecords: number,
    syncOnFlush: boolean,
    onBackpressure: (pendingRecords: number) => void,
  ) {
    this.filePath = filePath;
    this.flushEveryRecords = flushEveryRecords;
    this.syncOnFlush = syncOnFlush;
    this.onBackpressure = onBackpressure;
  }
  public async write(record: unknown): Promise<void> {
    if (this.closed)
      throw new Error(`Cannot write to closed sink: ${this.filePath}`);
    this.buffer.push(`${JSON.stringify(record)}\n`);
    if (this.flushing !== null) this.onBackpressure(this.buffer.length);
    if (this.buffer.length >= this.flushEveryRecords) {
      this.onBackpressure(this.buffer.length);
      await this.flush();
    }
  }
  public async flush(): Promise<void> {
    if (this.flushing !== null) await this.flushing;
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    const operation = this.writeBatch(batch);
    this.flushing = operation;
    try {
      await operation;
    } catch (caught) {
      this.buffer.unshift(...batch);
      throw caught;
    } finally {
      this.flushing = null;
    }
  }
  public async close(): Promise<void> {
    if (this.closed) return;
    await this.flush();
    this.closed = true;
    if (this.handle !== null) await this.handle.close();
    this.handle = null;
  }
  private async writeBatch(batch: readonly string[]): Promise<void> {
    const handle = await this.fileHandle();
    await handle.writeFile(batch.join(""), { encoding: "utf8" });
    if (this.syncOnFlush) await handle.sync();
  }
  private async fileHandle(): Promise<FileHandle> {
    if (this.handle === null)
      this.handle = await openPrivateFile(this.filePath, "a");
    return this.handle;
  }
}
