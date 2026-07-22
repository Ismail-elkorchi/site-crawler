export type ReplayEntity = "html-page" | "xml-resource";
export type ReplayStatus =
  "matched" | "changed" | "missing-evidence" | "failed";

export interface ReplayItem {
  readonly schemaId: "site-crawler.replayItem";
  readonly schemaVersion: 1;
  readonly entity: ReplayEntity;
  readonly requestId: string;
  readonly url: string;
  readonly evidenceDigest: string | null;
  readonly status: ReplayStatus;
  readonly previousHash: string | null;
  readonly replayedHash: string | null;
  readonly error: string | null;
}

export interface ReplayReport {
  readonly schemaId: "site-crawler.replayReport";
  readonly schemaVersion: 1;
  readonly runDirectory: string;
  readonly crawlerVersion: string;
  readonly htmlParserVersion: string | null;
  readonly xmlParserVersion: string | null;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly matched: number;
  readonly changed: number;
  readonly missingEvidence: number;
  readonly failed: number;
  readonly items: readonly ReplayItem[];
}
