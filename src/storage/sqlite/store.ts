import { ensurePrivateDirectory } from "../../core/private-files.js";
import type { ResolvedCrawlConfig } from "../../config/types.js";
import type { CrawlError } from "../../diagnostics/types.js";
import type { CrawledHtmlPage } from "../../html/types.js";
import type { LinkEdge } from "../../links/types.js";
import type {
  CrawlRequest,
  DiscoveryRecord,
  RequestStateRecord,
} from "../../requests/types.js";
import type { CrawledResource } from "../../resources/types.js";
import type { RobotsRecord } from "../../robots/types.js";
import type {
  CrawlResult,
  CrawlStats,
  RunManifest,
  SkippedUrl,
} from "../../results/types.js";
import type {
  CrawledXmlResource,
  FeedEntry,
  SitemapEntry,
} from "../../xml/types.js";
import { FileSystemStore } from "../filesystem-store.js";
import type {
  CrawlRecordQuery,
  IndexedCrawlRecord,
  QueryStore,
  ResultStore,
} from "../types.js";
import {
  discoveryRecord,
  errorRecord,
  feedRecord,
  htmlPageRecord,
  linkRecord,
  requestRecord,
  requestStateRecord,
  resourceRecord,
  robotsRecord,
  sitemapRecord,
  skippedRecord,
  xmlResourceRecord,
} from "./record.js";
import { SqliteRecordDatabase } from "./result-database.js";

export class SqliteResultStore implements ResultStore, QueryStore {
  public readonly outputDirectory: string;
  private readonly mirror: FileSystemStore;
  private readonly fsync: boolean;
  private readonly database: SqliteRecordDatabase;

  public constructor(
    outputDirectory: string,
    config: ResolvedCrawlConfig,
    onBackpressure: (pendingRecords: number) => void,
  ) {
    this.outputDirectory = outputDirectory;
    this.database = new SqliteRecordDatabase(
      outputDirectory,
      config.storage.sqliteFileName,
    );
    this.fsync = config.storage.fsync;
    this.mirror = new FileSystemStore(
      outputDirectory,
      config.storage.writeBufferSize,
      config.storage.fsync,
      config.storage.storeRawHtml,
      config.storage.storeRawXml,
      onBackpressure,
      config.storage.writeNdjsonExports,
    );
  }

  public async init(
    manifest: RunManifest,
    config: ResolvedCrawlConfig,
  ): Promise<void> {
    await ensurePrivateDirectory(this.outputDirectory);
    await this.database.open();
    await this.mirror.init(manifest, config);
    this.database.writeMetadata("manifest", manifest);
    this.database.writeMetadata("config", config);
  }

  public async writeManifest(value: RunManifest): Promise<void> {
    this.database.writeMetadata("manifest", value);
    await this.mirror.writeManifest(value);
  }

  public async writeStats(value: CrawlStats): Promise<void> {
    this.database.writeMetadata("stats", value);
    await this.mirror.writeStats(value);
  }

  public async writeSummary(value: CrawlResult): Promise<void> {
    this.database.writeMetadata("summary", value);
    await this.mirror.writeSummary(value);
  }

  public async writeRequest(value: CrawlRequest): Promise<void> {
    this.database.insert(requestRecord(value));
    await this.mirror.writeRequest(value);
  }

  public async writeRequestState(value: RequestStateRecord): Promise<void> {
    this.database.insert(requestStateRecord(value));
    await this.mirror.writeRequestState(value);
  }

  public async writeDiscovery(value: DiscoveryRecord): Promise<void> {
    this.database.insert(discoveryRecord(value));
    await this.mirror.writeDiscovery(value);
  }

  public async writeResource(value: CrawledResource): Promise<void> {
    this.database.insert(resourceRecord(value));
    await this.mirror.writeResource(value);
  }

  public async writeHtmlPage(value: CrawledHtmlPage): Promise<void> {
    this.database.insert(htmlPageRecord(value));
    await this.mirror.writeHtmlPage(value);
  }

  public async writeXmlResource(value: CrawledXmlResource): Promise<void> {
    this.database.insert(xmlResourceRecord(value));
    await this.mirror.writeXmlResource(value);
  }

  public async writeLink(value: LinkEdge): Promise<void> {
    this.database.insert(linkRecord(value));
    await this.mirror.writeLink(value);
  }

  public async writeSkipped(value: SkippedUrl): Promise<void> {
    this.database.insert(skippedRecord(value));
    await this.mirror.writeSkipped(value);
  }

  public async writeError(value: CrawlError): Promise<void> {
    this.database.insert(errorRecord(value));
    await this.mirror.writeError(value);
  }

  public async writeRobots(value: RobotsRecord): Promise<void> {
    this.database.insert(robotsRecord(value));
    await this.mirror.writeRobots(value);
  }

  public async writeSitemapEntry(value: SitemapEntry): Promise<void> {
    this.database.insert(sitemapRecord(value));
    await this.mirror.writeSitemapEntry(value);
  }

  public async writeFeedEntry(value: FeedEntry): Promise<void> {
    this.database.insert(feedRecord(value));
    await this.mirror.writeFeedEntry(value);
  }

  public async writeEvidence(
    requestId: string,
    kind: import("../../evidence/types.js").EvidenceKind,
    mediaType: string,
    bytes: Uint8Array,
  ): Promise<import("../../evidence/types.js").EvidenceReference | null> {
    return await this.mirror.writeEvidence(requestId, kind, mediaType, bytes);
  }

  public async query(
    query: CrawlRecordQuery,
  ): Promise<readonly IndexedCrawlRecord[]> {
    return this.database.query(query);
  }

  public evidenceStats(): import("../types.js").EvidenceStats {
    return this.mirror.evidenceStats();
  }

  public async flush(): Promise<void> {
    await this.mirror.flush();
    if (this.fsync) this.database.checkpoint();
  }

  public async close(): Promise<void> {
    await this.mirror.close();
    this.database.close();
  }
}
