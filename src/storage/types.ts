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

export type { ResumePolicy, StorageConfig } from "./config-types.js";

export interface EvidenceStats {
  readonly objects: number;
  readonly bytes: number;
}

export interface StoreLifecycle {
  readonly outputDirectory: string | null;
  init(manifest: RunManifest, config: ResolvedCrawlConfig): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
  evidenceStats(): EvidenceStats;
}

export interface RunMetadataStore {
  writeManifest(manifest: RunManifest): Promise<void>;
  writeStats(stats: CrawlStats): Promise<void>;
  writeSummary(result: CrawlResult): Promise<void>;
}

export interface SnapshotStore {
  writeEvidence(
    requestId: string,
    kind: EvidenceKind,
    mediaType: string,
    bytes: Uint8Array,
  ): Promise<EvidenceReference | null>;
}

export interface CrawlRecordStore {
  writeRequest(request: CrawlRequest): Promise<void>;
  writeRequestState(state: RequestStateRecord): Promise<void>;
  writeDiscovery(record: DiscoveryRecord): Promise<void>;
  writeResource(resource: CrawledResource): Promise<void>;
  writeHtmlPage(page: CrawledHtmlPage): Promise<void>;
  writeXmlResource(resource: CrawledXmlResource): Promise<void>;
  writeLink(link: LinkEdge): Promise<void>;
  writeSkipped(skipped: SkippedUrl): Promise<void>;
  writeError(error: CrawlError): Promise<void>;
  writeRobots(record: RobotsRecord): Promise<void>;
  writeSitemapEntry(entry: SitemapEntry): Promise<void>;
  writeFeedEntry(entry: FeedEntry): Promise<void>;
}

export interface ResultStore
  extends StoreLifecycle, RunMetadataStore, SnapshotStore, CrawlRecordStore {}

export type CrawlRecordKind =
  | "request"
  | "request-state"
  | "discovery"
  | "resource"
  | "html-page"
  | "xml-resource"
  | "link"
  | "skipped"
  | "error"
  | "robots"
  | "sitemap-entry"
  | "feed-entry";

export interface CrawlRecordQuery {
  readonly kind?: CrawlRecordKind;
  readonly requestId?: string;
  readonly url?: string;
  readonly statusCode?: number;
  readonly fromUrl?: string;
  readonly toUrl?: string;
  readonly limit?: number;
}

export interface IndexedCrawlRecord {
  readonly kind: CrawlRecordKind;
  readonly recordId: string;
  readonly requestId: string | null;
  readonly url: string | null;
  readonly statusCode: number | null;
  readonly fromUrl: string | null;
  readonly toUrl: string | null;
  readonly createdAt: string;
  readonly data: unknown;
}

export interface QueryStore {
  query(query: CrawlRecordQuery): Promise<readonly IndexedCrawlRecord[]>;
}
