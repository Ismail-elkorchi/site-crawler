import type { FileHandle } from "node:fs/promises";
import fs from "node:fs/promises";
import { openPrivateFile } from "../core/private-files.js";
import { validatePersistedRecord } from "../contracts/catalog.js";
import { faultPoint } from "../faults/injector.js";
import { buildJournalRecord, decodeJournalRecord } from "./journal-codec.js";
import { FrontierJournalError } from "./journal-error.js";
import { validateJournal } from "./journal-validation.js";
import type {
  FrontierJournalRecord,
  UnsequencedFrontierJournalRecord,
} from "./types.js";

export { FrontierJournalError } from "./journal-error.js";

interface PendingAppend {
  readonly record: UnsequencedFrontierJournalRecord;
  readonly resolve: (record: FrontierJournalRecord) => void;
  readonly reject: (error: unknown) => void;
}

export class FrontierJournal {
  private handle: FileHandle | null = null;
  private sequence = 0;
  private lastChecksum: string | null = null;
  private readonly pending: PendingAppend[] = [];
  private pendingHead = 0;
  private draining = false;
  private readonly idleResolvers: Array<() => void> = [];
  private closing = false;
  private closed = false;
  private readonly filePath: string | null;
  private readonly syncWrites: boolean;

  public constructor(filePath: string | null, syncWrites: boolean) {
    this.filePath = filePath;
    this.syncWrites = syncWrites;
  }

  public async load(): Promise<readonly FrontierJournalRecord[]> {
    this.assertOpen("load");
    if (this.filePath === null) return [];
    let text: string;
    try {
      text = await fs.readFile(this.filePath, "utf8");
    } catch (caught) {
      if (isMissingFile(caught)) return [];
      throw caught;
    }
    const records = parseRecords(text);
    validateJournal(records);
    const last = records.at(-1);
    this.sequence = last?.sequence ?? 0;
    this.lastChecksum = last?.checksum ?? null;
    return records;
  }

  public append(
    record: UnsequencedFrontierJournalRecord,
  ): Promise<FrontierJournalRecord> {
    if (this.closing || this.closed) {
      return Promise.reject(
        new FrontierJournalError(
          "Cannot append to a closing frontier journal.",
        ),
      );
    }
    const result = new Promise<FrontierJournalRecord>((resolve, reject) => {
      this.pending.push({ record, resolve, reject });
    });
    this.ensureDrain();
    return result;
  }

  public async flush(): Promise<void> {
    while (this.draining || this.hasPending()) {
      await new Promise<void>((resolve) => {
        this.idleResolvers.push(resolve);
        this.ensureDrain();
      });
    }
    if (this.syncWrites && this.handle !== null) await this.handle.sync();
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closing = true;
    await this.flush();
    if (this.handle !== null) await this.handle.close();
    this.handle = null;
    this.closed = true;
    this.closing = false;
  }

  private ensureDrain(): void {
    if (this.draining || !this.hasPending()) return;
    this.draining = true;
    setImmediate(() => {
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    try {
      while (this.hasPending()) {
        const item = this.pending[this.pendingHead];
        this.pendingHead += 1;
        if (item === undefined) {
          throw new FrontierJournalError("Frontier journal queue is corrupt.");
        }
        try {
          item.resolve(await this.appendSerialized(item.record));
        } catch (caught) {
          item.reject(caught);
        }
      }
    } catch (caught) {
      this.rejectPending(caught);
    } finally {
      this.pending.length = 0;
      this.pendingHead = 0;
      this.draining = false;
      const resolvers = this.idleResolvers.splice(0);
      for (const resolve of resolvers) resolve();
      this.ensureDrain();
    }
  }

  private rejectPending(error: unknown): void {
    while (this.hasPending()) {
      const item = this.pending[this.pendingHead];
      this.pendingHead += 1;
      item?.reject(error);
    }
  }

  private hasPending(): boolean {
    return this.pendingHead < this.pending.length;
  }

  private async appendSerialized(
    record: UnsequencedFrontierJournalRecord,
  ): Promise<FrontierJournalRecord> {
    faultPoint("before-journal-append");
    const sequence = this.sequence + 1;
    const sequenced = buildJournalRecord(record, sequence, this.lastChecksum);
    validatePersistedRecord(sequenced);
    if (this.filePath !== null) {
      const handle = await this.fileHandle();
      await handle.writeFile(`${JSON.stringify(sequenced)}\n`, "utf8");
      if (this.syncWrites) await handle.sync();
    }
    this.sequence = sequence;
    this.lastChecksum = sequenced.checksum;
    faultPoint("after-journal-append");
    return sequenced;
  }

  private async fileHandle(): Promise<FileHandle> {
    if (this.filePath === null) {
      throw new FrontierJournalError("Frontier journal is disabled.");
    }
    if (this.handle === null)
      this.handle = await openPrivateFile(this.filePath, "a");
    return this.handle;
  }

  private assertOpen(operation: string): void {
    if (this.closing || this.closed) {
      throw new FrontierJournalError(
        `Cannot ${operation} a closing frontier journal.`,
      );
    }
  }
}

function parseRecords(text: string): FrontierJournalRecord[] {
  const records: FrontierJournalRecord[] = [];
  const lines = text.split("\n");
  const hasIncompleteTail = !text.endsWith("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (line.length === 0) continue;
    try {
      const decoded = decodeJournalRecord(JSON.parse(line));
      if (decoded === null) {
        throw new FrontierJournalError(
          `Invalid frontier journal record at line ${index + 1}.`,
        );
      }
      records.push(decoded);
    } catch (caught) {
      if (index === lines.length - 1 && hasIncompleteTail) break;
      if (caught instanceof FrontierJournalError) throw caught;
      throw new FrontierJournalError(
        `Corrupt frontier journal at line ${index + 1}.`,
      );
    }
  }
  return records;
}

function isMissingFile(value: unknown): boolean {
  return value instanceof Error && "code" in value && value.code === "ENOENT";
}
