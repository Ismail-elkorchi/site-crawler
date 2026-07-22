import type { CssDiscoveryConfig } from "../css/types.js";
import type { HtmlParsingConfig } from "../html/config-types.js";
import type { HttpCacheConfig } from "../http/cache/types.js";
import type { NetworkConfig, ResponseLimits } from "../http/types.js";
import type { SessionConfig } from "../http/session/types.js";
import type { JsDiscoveryConfig } from "../javascript/types.js";
import type { NetworkSafetyConfig } from "../network/types.js";
import type { RenderingConfig } from "../rendering/types.js";
import type { OutputConfig } from "../results/config-types.js";
import type { RobotsConfig } from "../robots/types.js";
import type { StorageConfig } from "../storage/config-types.js";
import type { ScopeConfig } from "../url/types.js";
import type {
  FeedConfig,
  SitemapConfig,
  XmlParsingConfig,
} from "../xml/config-types.js";
import type { CrawlLimits } from "./types.js";

export const defaultScope: ScopeConfig = {
  mode: "origin",
  include: [],
  exclude: [],
  allowedHosts: [],
  deniedHosts: [],
  maxUrlLength: 2048,
  maxPathSegments: 20,
  maxQueryParams: 20,
  maxUrlsPerDirectory: 10000,
  maxUrlsPerPathPattern: 10000,
};

export const defaultLimits: CrawlLimits = {
  maxScheduledRequests: 1000,
  maxFetchedResources: 1000,
  maxDepth: 5,
  maxRunTimeMs: 30 * 60 * 1000,
  maxQueueSize: 100000,
  maxDiscoveredLinksPerPage: 1000,
  maxDownloadedBytes: 1024 * 1024 * 1024,
};

export const defaultNetworkSafety: NetworkSafetyConfig = {
  enabled: true,
  allowPrivateNetworks: false,
  allowLocalhost: false,
  mixedAddressPolicy: "reject-host",
  dnsTimeoutMs: 5000,
  dnsCacheTtlMs: 60000,
};

export const defaultRobots: RobotsConfig = {
  enabled: true,
  userAgent: "IsmailSiteCrawler/0.1.0",
  productToken: "IsmailSiteCrawler",
  on4xx: "allow",
  on5xx: "disallow",
  onNetworkError: "disallow",
  respectCrawlDelay: false,
  maxBytes: 512 * 1024,
  cacheTtlMs: 24 * 60 * 60 * 1000,
};

export const defaultSitemaps: SitemapConfig = {
  enabled: true,
  discoverFromRobots: true,
  probeDefaultSitemap: true,
  manual: [],
  enqueueEntries: true,
  maxSitemapFiles: 1000,
  maxEntriesPerSitemap: 50000,
  maxTotalEntries: 1000000,
  maxSitemapIndexDepth: 5,
};

export const defaultFeeds: FeedConfig = {
  enabled: false,
  discoverFromHtml: true,
  enqueueEntries: false,
};

export const defaultJsDiscovery: JsDiscoveryConfig = {
  enabled: false,
  mode: "hybrid",
  enqueueDiscoveredUrls: false,
  fetchScriptAssets: false,
  maxScriptBytes: 2 * 1024 * 1024,
  maxUrlsPerScript: 500,
};

export const defaultCssDiscovery: CssDiscoveryConfig = {
  enabled: false,
  fetchStylesheets: false,
  enqueueDiscoveredUrls: false,
  maxStylesheetBytes: 2 * 1024 * 1024,
  maxUrlsPerStylesheet: 500,
};

export const defaultNetwork: NetworkConfig = {
  maxConcurrency: 8,
  maxConcurrencyPerOrigin: 2,
  requestTimeoutMs: 30000,
  connectTimeoutMs: 10000,
  firstByteTimeoutMs: 20000,
  maxRedirects: 10,
  retries: 2,
  retryBackoffMs: 1000,
  respectRetryAfter: true,
  minDelayMsPerOrigin: 0,
  maxRequestsPerMinutePerOrigin: null,
  protocolPreference: "auto",
  rejectUnauthorized: true,
  autoThrottle: {
    enabled: true,
    targetConcurrencyPerOrigin: 1,
    startDelayMs: 100,
    minDelayMs: 0,
    maxDelayMs: 30000,
    smoothing: 0.3,
  },
  headers: {},
};

export const defaultSession: SessionConfig = {
  enabled: false,
  persistCookies: false,
  cookieFile: null,
  initialCookies: [],
  basicAuth: [],
  bearerAuth: [],
};

export const defaultHttpCache: HttpCacheConfig = {
  enabled: false,
  directory: "./.site-crawler-cache",
  storeBodies: true,
  maxBodyBytes: 10 * 1024 * 1024,
  useStaleOnError: false,
};

export const defaultResponseLimits: ResponseLimits = {
  maxCompressedBytes: 5 * 1024 * 1024,
  maxDecompressedBytes: 10 * 1024 * 1024,
  memoryThresholdBytes: 1024 * 1024,
  spoolDirectory: null,
};

export const defaultHtmlParsing: HtmlParsingConfig = {
  maxInputBytes: 5 * 1024 * 1024,
  maxNodes: 200000,
  maxDepth: 512,
  maxTextBytes: 1000000,
};

export const defaultXmlParsing: XmlParsingConfig = {
  maxStreamBytes: 5 * 1024 * 1024,
  maxNodes: 200000,
  maxDepth: 256,
  maxTextBytes: 5 * 1024 * 1024,
};

export const defaultRendering: RenderingConfig = {
  mode: "never",
  maxRenderedPages: 0,
  navigationTimeoutMs: 30000,
  extractionTimeoutMs: 10000,
  autoRenderMinTextLength: 200,
  autoRenderWhenNoLinks: true,
  autoRenderFrameworkShells: true,
  autoRenderUrlPatterns: [],
  waitUntil: "domcontentloaded",
};

export const defaultStorage: StorageConfig = {
  type: "sqlite",
  frontierBackend: "sqlite",
  frontierOrder: "priority",
  directory: "./runs",
  sqliteFileName: "crawl.sqlite",
  resumeFrom: null,
  resumePolicy: "exact",
  durableFrontier: true,
  leaseDurationMs: 60000,
  leaseRenewalIntervalMs: 20000,
  lockHeartbeatMs: 5000,
  staleLockMs: 120000,
  storeRawHtml: false,
  storeRawXml: false,
  writeNdjsonExports: true,
  writeBufferSize: 100,
  fsync: false,
};

export const defaultOutput: OutputConfig = {
  writeSkippedUrls: true,
  writeSummary: true,
  hashBodies: true,
};
