import path from "node:path";
import {
  ensurePrivateDirectory,
  writePrivateFileAtomic,
} from "../core/private-files.js";
import { faultPoint } from "../faults/injector.js";
import {
  SITE_CRAWLER_RUN_FORMAT,
  SITE_CRAWLER_WORKER_PROTOCOL,
} from "../core/version.js";
import type { ResolvedCrawlConfig } from "../config/types.js";
import type { CrawlError } from "../diagnostics/types.js";
import { ContentAddressedEvidenceStore } from "../evidence/content-addressed-store.js";
import type {
  EvidenceAssociation,
  EvidenceKind,
  EvidenceReference,
} from "../evidence/types.js";
import type { CrawledHtmlPage } from "../html/types.js";
import type { LinkEdge } from "../links/types.js";
import type {
  CrawlRequest,
  DiscoveryRecord,
  RequestStateRecord,
} from "../requests/types.js";
import type { CrawledResource } from "../resources/types.js";
import type { RobotsRecord } from "../robots/types.js";
import type {
  CrawlResult,
  CrawlStats,
  RunManifest,
  SkippedUrl,
} from "../results/types.js";
import type {
  CrawledXmlResource,
  FeedEntry,
  SitemapEntry,
} from "../xml/types.js";
import { JsonLineSink } from "./json-line-sink.js";
import { redactConfig } from "./redact-config.js";
import type { ResultStore } from "./types.js";
import { validatePersistedRecord } from "../contracts/catalog.js";

export class FileSystemStore implements ResultStore {
  public readonly outputDirectory: string;
  private readonly evidence: ContentAddressedEvidenceStore;
  private readonly sinks = new Map<string, JsonLineSink>();
  private readonly flushEveryRecords: number;
  private readonly syncOnFlush: boolean;
  private readonly storeRawHtml: boolean;
  private readonly storeRawXml: boolean;
  private readonly onBackpressure: (pendingRecords: number) => void;
  private readonly writeRecords: boolean;
  private evidenceObjects = 0;
  private evidenceBytes = 0;

  public constructor(
    outputDirectory: string,
    flushEveryRecords: number,
    syncOnFlush: boolean,
    storeRawHtml: boolean,
    storeRawXml: boolean,
    onBackpressure: (pendingRecords: number) => void,
    writeRecords = true,
  ) {
    this.outputDirectory = path.resolve(outputDirectory);
    this.evidence = new ContentAddressedEvidenceStore(this.outputDirectory);
    this.flushEveryRecords = flushEveryRecords;
    this.syncOnFlush = syncOnFlush;
    this.storeRawHtml = storeRawHtml;
    this.storeRawXml = storeRawXml;
    this.onBackpressure = onBackpressure;
    this.writeRecords = writeRecords;
  }

  public async init(
    manifest: RunManifest,
    config: ResolvedCrawlConfig,
  ): Promise<void> {
    await ensurePrivateDirectory(this.outputDirectory);
    if (this.storeRawHtml || this.storeRawXml) await this.evidence.init();
    await this.writeJsonAtomic("manifest.json", manifest);
    await this.writeJsonAtomic("config.resolved.json", redactConfig(config));
    await this.writeJsonAtomic("run-format.json", {
      schemaId: "site-crawler.runFormat",
      schemaVersion: 1,
      runId: manifest.runId,
      formatVersion: SITE_CRAWLER_RUN_FORMAT,
      workerProtocol: SITE_CRAWLER_WORKER_PROTOCOL,
      schemaSetVersion: manifest.schemaSetVersion,
      createdAt: new Date().toISOString(),
    });
  }
  public async writeManifest(value: RunManifest): Promise<void> {
    await this.writeJsonAtomic("manifest.json", value);
  }
  public async writeStats(value: CrawlStats): Promise<void> {
    await this.writeJsonAtomic("stats.json", value);
  }
  public async writeSummary(value: CrawlResult): Promise<void> {
    await this.writeTextAtomic("summary.md", summaryMarkdown(value));
  }
  public async writeRequest(value: CrawlRequest): Promise<void> {
    await this.append("requests.ndjson", value);
  }
  public async writeRequestState(value: RequestStateRecord): Promise<void> {
    await this.append("request-states.ndjson", value);
  }
  public async writeDiscovery(value: DiscoveryRecord): Promise<void> {
    await this.append("discoveries.ndjson", value);
  }
  public async writeResource(value: CrawledResource): Promise<void> {
    await this.append("resources.ndjson", value);
  }
  public async writeHtmlPage(value: CrawledHtmlPage): Promise<void> {
    await this.append("pages.ndjson", value);
  }
  public async writeXmlResource(value: CrawledXmlResource): Promise<void> {
    await this.append("xml.ndjson", value);
  }
  public async writeSitemapEntry(value: SitemapEntry): Promise<void> {
    await this.append("sitemaps.ndjson", value);
  }
  public async writeFeedEntry(value: FeedEntry): Promise<void> {
    await this.append("feeds.ndjson", value);
  }
  public async writeLink(value: LinkEdge): Promise<void> {
    await this.append("links.ndjson", value);
  }
  public async writeSkipped(value: SkippedUrl): Promise<void> {
    await this.append("skipped.ndjson", value);
  }
  public async writeError(value: CrawlError): Promise<void> {
    await this.append("errors.ndjson", value);
  }
  public async writeRobots(value: RobotsRecord): Promise<void> {
    await this.append("robots.ndjson", value);
  }

  public async writeEvidence(
    requestId: string,
    kind: EvidenceKind,
    mediaType: string,
    bytes: Uint8Array,
  ): Promise<EvidenceReference | null> {
    if (!this.shouldStore(kind)) return null;
    return await this.persistEvidence(requestId, kind, mediaType, bytes);
  }

  public evidenceStats(): import("./types.js").EvidenceStats {
    return { objects: this.evidenceObjects, bytes: this.evidenceBytes };
  }

  public async flush(): Promise<void> {
    await Promise.all(
      [...this.sinks.values()].map(async (sink) => await sink.flush()),
    );
  }

  public async close(): Promise<void> {
    await Promise.all(
      [...this.sinks.values()].map(async (sink) => await sink.close()),
    );
    this.sinks.clear();
  }

  private async persistEvidence(
    requestId: string,
    kind: EvidenceKind,
    mediaType: string,
    bytes: Uint8Array,
  ): Promise<EvidenceReference> {
    faultPoint("before-evidence-write");
    const result = await this.evidence.writeBytes(kind, mediaType, bytes);
    faultPoint("after-evidence-write");
    if (result.created) {
      this.evidenceObjects += 1;
      this.evidenceBytes += result.reference.byteLength;
    }
    const association: EvidenceAssociation = {
      schemaId: "site-crawler.evidenceAssociation",
      schemaVersion: 1,
      requestId,
      reference: result.reference,
      recordedAt: new Date().toISOString(),
    };
    await this.append("evidence.ndjson", association);
    return result.reference;
  }

  private shouldStore(kind: EvidenceKind): boolean {
    return kind === "xml" ? this.storeRawXml : this.storeRawHtml;
  }

  private async append(fileName: string, record: unknown): Promise<void> {
    if (!this.writeRecords) return;
    validatePersistedRecord(record);
    let sink = this.sinks.get(fileName);
    if (sink === undefined) {
      sink = new JsonLineSink(
        path.join(this.outputDirectory, fileName),
        this.flushEveryRecords,
        this.syncOnFlush,
        this.onBackpressure,
      );
      this.sinks.set(fileName, sink);
    }
    await sink.write(record);
  }

  private async writeJsonAtomic(
    fileName: string,
    record: unknown,
  ): Promise<void> {
    validatePersistedRecord(record);
    if (fileName === "manifest.json") faultPoint("before-manifest-write");
    await this.writeTextAtomic(
      fileName,
      `${JSON.stringify(record, null, 2)}\n`,
    );
    if (fileName === "manifest.json") faultPoint("after-manifest-write");
  }

  private async writeTextAtomic(
    fileName: string,
    content: string,
  ): Promise<void> {
    await writePrivateFileAtomic(
      path.join(this.outputDirectory, fileName),
      content,
      this.syncOnFlush,
    );
  }
}

function summaryMarkdown(result: CrawlResult): string {
  const stats = result.stats;
  return [
    `# Crawl ${result.runId}`,
    "",
    `- Status: ${result.status}`,
    `- Stop reason: ${result.stopReason ?? "none"}`,
    `- Scheduled requests: ${stats.requestsScheduled}`,
    `- Fetched resources: ${stats.requestsFetched}`,
    `- Failed requests: ${stats.requestsFailed}`,
    `- HTML pages: ${stats.htmlPagesParsed}`,
    `- XML resources: ${stats.xmlResourcesParsed}`,
    `- Evidence objects: ${stats.evidenceObjectsWritten}`,
    `- Downloaded bytes: ${stats.bytesDownloaded}`,
    `- Duration milliseconds: ${stats.durationMs}`,
    "",
  ].join("\n");
}
