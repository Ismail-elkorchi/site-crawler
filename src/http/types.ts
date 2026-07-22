import type { CrawlError } from "../diagnostics/types.js";
import type { RequestMethod } from "../requests/types.js";
import type { RedirectHop } from "../resources/types.js";
import type { ResponseBody } from "./body-types.js";
import type { CacheStatus, HttpCacheConfig } from "./cache/types.js";
import type { SessionConfig } from "./session/types.js";
import type {
  NegotiatedProtocol,
  NetworkTimings,
  TlsFacts,
} from "./timing-types.js";

export interface RedirectTargetDecision {
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly scopeAllowed: boolean | null;
  readonly robotsAllowed: boolean | null;
  readonly networkSafetyAllowed: boolean | null;
}

export interface FetchOptions {
  readonly requestId: string;
  readonly method: RequestMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly responseLimits?: ResponseLimits;
  readonly maxRedirects?: number;
  readonly onRedirectTarget: (
    targetUrl: string,
  ) => Promise<RedirectTargetDecision>;
}

export interface FetchResult {
  readonly statusCode: number | null;
  readonly finalUrl: string | null;
  readonly headers: Headers;
  readonly body: ResponseBody | null;
  readonly redirects: readonly RedirectHop[];
  readonly responseTimeMs: number;
  readonly wireBytesRead: number | null;
  readonly decodedBytesRead: number | null;
  readonly remoteAddress: string | null;
  readonly protocol: NegotiatedProtocol;
  readonly timings: NetworkTimings;
  readonly tls: TlsFacts | null;
  readonly cacheStatus: CacheStatus;
  readonly error: CrawlError | null;
}

export interface HttpClient {
  fetch(url: string, options: FetchOptions): Promise<FetchResult>;
  close?(): Promise<void>;
}

export interface AutoThrottleConfig {
  readonly enabled: boolean;
  readonly targetConcurrencyPerOrigin: number;
  readonly startDelayMs: number;
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
  readonly smoothing: number;
}

export interface NetworkConfig {
  readonly maxConcurrency: number;
  readonly maxConcurrencyPerOrigin: number;
  readonly requestTimeoutMs: number;
  readonly connectTimeoutMs: number;
  readonly firstByteTimeoutMs: number;
  readonly maxRedirects: number;
  readonly retries: number;
  readonly retryBackoffMs: number;
  readonly respectRetryAfter: boolean;
  readonly minDelayMsPerOrigin: number;
  readonly maxRequestsPerMinutePerOrigin: number | null;
  readonly protocolPreference: "auto" | "http1" | "http2";
  readonly rejectUnauthorized: boolean;
  readonly autoThrottle: AutoThrottleConfig;
  readonly headers: Readonly<Record<string, string>>;
}

export interface ResponseLimits {
  readonly maxCompressedBytes: number;
  readonly maxDecompressedBytes: number;
  readonly memoryThresholdBytes: number;
  readonly spoolDirectory: string | null;
}

export interface HttpRuntimeConfig {
  readonly network: NetworkConfig;
  readonly responseLimits: ResponseLimits;
  readonly session: SessionConfig;
  readonly httpCache: HttpCacheConfig;
}
