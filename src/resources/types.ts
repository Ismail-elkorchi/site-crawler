import type { CrawlError, CrawlWarning } from "../diagnostics/types.js";
import type { EncodingFact } from "../encoding/types.js";
import type { CacheStatus } from "../http/cache/types.js";
import type {
  NegotiatedProtocol,
  NetworkTimings,
  TlsFacts,
} from "../http/timing-types.js";
import type { NetworkSafetyDecision } from "../network/types.js";
import type { RobotsDecision } from "../robots/types.js";
import type { ScopeDecision } from "../url/types.js";

export type ResourceType =
  | "html"
  | "xml"
  | "sitemap"
  | "sitemap-index"
  | "feed"
  | "json"
  | "text"
  | "pdf"
  | "image"
  | "css"
  | "javascript"
  | "font"
  | "video"
  | "audio"
  | "archive"
  | "binary"
  | "empty"
  | "unknown"
  | "error";

export interface RedirectHop {
  readonly fromUrl: string;
  readonly toUrl: string;
  readonly statusCode: number;
  readonly hopIndex: number;
  readonly validTarget: boolean;
  readonly scopeAllowed: boolean | null;
  readonly robotsAllowed: boolean | null;
  readonly networkSafetyAllowed: boolean | null;
  readonly timestamp: string;
}

export interface BodyHash {
  readonly rawSha256: string | null;
  readonly decodedSha256: string | null;
}

export interface CrawledResource {
  readonly schemaId: "site-crawler.resource";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly requestId: string;
  readonly requestedUrl: string;
  readonly normalizedUrl: string;
  readonly finalUrl: string | null;
  readonly statusCode: number | null;
  readonly ok: boolean;
  readonly resourceType: ResourceType;
  readonly contentType: string | null;
  readonly contentLength: number | null;
  readonly wireBytesRead: number | null;
  readonly httpDecodedBytesRead: number | null;
  readonly fileDecodedBytesRead: number | null;
  readonly remoteAddress: string | null;
  readonly httpProtocol: NegotiatedProtocol;
  readonly networkTimings: NetworkTimings;
  readonly tls: TlsFacts | null;
  readonly cacheStatus: CacheStatus;
  readonly responseTimeMs: number;
  readonly fetchedAt: string;
  readonly redirects: readonly RedirectHop[];
  readonly encoding: EncodingFact | null;
  readonly bodyHash: BodyHash | null;
  readonly scopeDecision: ScopeDecision;
  readonly robotsDecision: RobotsDecision;
  readonly networkSafetyDecision: NetworkSafetyDecision;
  readonly warnings: readonly CrawlWarning[];
  readonly error: CrawlError | null;
}
