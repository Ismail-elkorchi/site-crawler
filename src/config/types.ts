import type { CssDiscoveryConfig } from "../css/types.js";
import type { HtmlParsingConfig } from "../html/config-types.js";
import type { HttpCacheConfig } from "../http/cache/types.js";
import type { NetworkConfig, ResponseLimits } from "../http/types.js";
import type { SessionConfig } from "../http/session/types.js";
import type { JsDiscoveryConfig } from "../javascript/types.js";
import type { NetworkSafetyConfig } from "../network/types.js";
import type { RenderingConfig } from "../rendering/types.js";
import type { CrawlSeedInput, ResolvedSeed } from "../requests/types.js";
import type { OutputConfig } from "../results/config-types.js";
import type { RobotsConfig } from "../robots/types.js";
import type { StorageConfig } from "../storage/config-types.js";
import type { ScopeConfig } from "../url/types.js";
import type {
  FeedConfig,
  SitemapConfig,
  XmlParsingConfig,
} from "../xml/config-types.js";

export interface CrawlLimits {
  readonly maxScheduledRequests: number;
  readonly maxFetchedResources: number;
  readonly maxDepth: number;
  readonly maxRunTimeMs: number;
  readonly maxQueueSize: number;
  readonly maxDiscoveredLinksPerPage: number;
  readonly maxDownloadedBytes: number;
}

export type CrawlLimitsInput = Partial<CrawlLimits>;

export interface ParsingConfig {
  readonly html: HtmlParsingConfig;
  readonly xml: XmlParsingConfig;
}

export interface ParsingConfigInput {
  readonly html?: Partial<HtmlParsingConfig>;
  readonly xml?: Partial<XmlParsingConfig>;
}

export type NetworkConfigInput = Omit<
  Partial<NetworkConfig>,
  "autoThrottle"
> & {
  readonly autoThrottle?: Partial<NetworkConfig["autoThrottle"]>;
};

export interface CrawlConfig {
  readonly seeds: readonly CrawlSeedInput[];
  readonly scope?: Partial<ScopeConfig>;
  readonly limits?: CrawlLimitsInput;
  readonly networkSafety?: Partial<NetworkSafetyConfig>;
  readonly robots?: Partial<RobotsConfig>;
  readonly sitemaps?: Partial<SitemapConfig>;
  readonly feeds?: Partial<FeedConfig>;
  readonly jsDiscovery?: Partial<JsDiscoveryConfig>;
  readonly cssDiscovery?: Partial<CssDiscoveryConfig>;
  readonly network?: NetworkConfigInput;
  readonly session?: Partial<SessionConfig>;
  readonly httpCache?: Partial<HttpCacheConfig>;
  readonly responseLimits?: Partial<ResponseLimits>;
  readonly parsing?: ParsingConfigInput;
  readonly rendering?: Partial<RenderingConfig>;
  readonly storage?: Partial<StorageConfig>;
  readonly output?: Partial<OutputConfig>;
}

export interface ResolvedCrawlConfig {
  readonly schemaId: "site-crawler.resolvedConfig";
  readonly schemaVersion: 1;
  readonly seeds: readonly ResolvedSeed[];
  readonly seedUrls: readonly string[];
  readonly scope: ScopeConfig;
  readonly limits: CrawlLimits;
  readonly networkSafety: NetworkSafetyConfig;
  readonly robots: RobotsConfig;
  readonly sitemaps: SitemapConfig;
  readonly feeds: FeedConfig;
  readonly jsDiscovery: JsDiscoveryConfig;
  readonly cssDiscovery: CssDiscoveryConfig;
  readonly network: NetworkConfig;
  readonly session: SessionConfig;
  readonly httpCache: HttpCacheConfig;
  readonly responseLimits: ResponseLimits;
  readonly parsing: ParsingConfig;
  readonly rendering: RenderingConfig;
  readonly storage: StorageConfig;
  readonly output: OutputConfig;
}
