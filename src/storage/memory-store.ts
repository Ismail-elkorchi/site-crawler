import { createHash } from "node:crypto";
import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlError } from "../diagnostics/types.js";
import type { EvidenceKind, EvidenceReference } from "../evidence/types.js";
import type { CrawledHtmlPage } from "../html/types.js";
import type { LinkEdge } from "../links/types.js";
import type {
  CrawlRequest,
  DiscoveryRecord,
  RequestStateRecord,
} from "../requests/types.js";
import type { CrawledResource } from "../resources/types.js";
import type { RobotsRecord } from "../robots/types.js";
import type { CrawlStats, RunManifest, SkippedUrl } from "../results/types.js";
import type {
  CrawledXmlResource,
  FeedEntry,
  SitemapEntry,
} from "../xml/types.js";
import type { ResultStore } from "./types.js";
import { validatePersistedRecord } from "../contracts/catalog.js";

export class MemoryStore implements ResultStore {
  public readonly outputDirectory: string | null = null;
  public readonly records: unknown[] = [];
  public readonly snapshots: Map<string, Uint8Array> = new Map<
    string,
    Uint8Array
  >();
  private readonly storeRawHtml: boolean;
  private readonly storeRawXml: boolean;
  private evidenceBytes = 0;

  public constructor(storeRawHtml: boolean, storeRawXml: boolean) {
    this.storeRawHtml = storeRawHtml;
    this.storeRawXml = storeRawXml;
  }

  public async init(
    manifest: RunManifest,
    config: ResolvedCrawlConfig,
  ): Promise<void> {
    this.persist(manifest);
    this.persist(config);
  }
  public async writeManifest(value: RunManifest): Promise<void> {
    this.persist(value);
  }
  public async writeStats(value: CrawlStats): Promise<void> {
    this.persist(value);
  }
  public async writeSummary(
    value: import("../results/types.js").CrawlResult,
  ): Promise<void> {
    this.persist(value);
  }
  public async writeRequest(value: CrawlRequest): Promise<void> {
    this.persist(value);
  }
  public async writeRequestState(value: RequestStateRecord): Promise<void> {
    this.persist(value);
  }
  public async writeDiscovery(value: DiscoveryRecord): Promise<void> {
    this.persist(value);
  }
  public async writeResource(value: CrawledResource): Promise<void> {
    this.persist(value);
  }
  public async writeHtmlPage(value: CrawledHtmlPage): Promise<void> {
    this.persist(value);
  }
  public async writeXmlResource(value: CrawledXmlResource): Promise<void> {
    this.persist(value);
  }
  public async writeSitemapEntry(value: SitemapEntry): Promise<void> {
    this.persist(value);
  }
  public async writeFeedEntry(value: FeedEntry): Promise<void> {
    this.persist(value);
  }
  public async writeLink(value: LinkEdge): Promise<void> {
    this.persist(value);
  }
  public async writeSkipped(value: SkippedUrl): Promise<void> {
    this.persist(value);
  }
  public async writeError(value: CrawlError): Promise<void> {
    this.persist(value);
  }
  public async writeRobots(value: RobotsRecord): Promise<void> {
    this.persist(value);
  }

  public async writeEvidence(
    _requestId: string,
    kind: EvidenceKind,
    mediaType: string,
    bytes: Uint8Array,
  ): Promise<EvidenceReference | null> {
    if (!this.shouldStore(kind)) return null;
    return this.snapshot(kind, mediaType, bytes);
  }

  public evidenceStats(): import("./types.js").EvidenceStats {
    return { objects: this.snapshots.size, bytes: this.evidenceBytes };
  }

  public async flush(): Promise<void> {
    return;
  }
  public async close(): Promise<void> {
    return;
  }

  private snapshot(
    kind: EvidenceKind,
    mediaType: string,
    bytes: Uint8Array,
  ): EvidenceReference {
    const digest = createHash("sha256").update(bytes).digest("hex");
    const relativePath = `memory/evidence/sha256/${digest}`;
    if (!this.snapshots.has(digest)) this.evidenceBytes += bytes.byteLength;
    this.snapshots.set(digest, bytes.slice());
    return {
      schemaId: "site-crawler.evidenceReference",
      schemaVersion: 1,
      algorithm: "sha256",
      digest,
      kind,
      mediaType,
      byteLength: bytes.byteLength,
      capture: { kind: "complete", sourceByteLength: bytes.byteLength },
      relativePath,
      createdAt: new Date().toISOString(),
    };
  }

  private shouldStore(kind: EvidenceKind): boolean {
    return kind === "xml" ? this.storeRawXml : this.storeRawHtml;
  }

  private persist(value: unknown): void {
    this.records.push(validatePersistedRecord(value));
  }
}
