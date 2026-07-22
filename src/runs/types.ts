import type { CrawlRecordKind } from "../storage/types.js";

export interface RunRecord {
  readonly kind: CrawlRecordKind;
  readonly recordId: string;
  readonly data: unknown;
}

export interface RunReader {
  metadata(
    key: "manifest" | "config" | "stats" | "summary",
  ): Promise<unknown | null>;
  records(kind: CrawlRecordKind): AsyncIterable<RunRecord>;
  close(): Promise<void>;
}
