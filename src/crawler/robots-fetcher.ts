import type { ResolvedCrawlConfig } from "../config/types.js";
import { makeId, nowIso } from "../core/utils.js";
import { decodeBody } from "../encoding/index.js";
import { disposeResponseBody, readResponseBody } from "../http/body.js";
import type { HttpClient } from "../http/index.js";
import type { NetworkSafetyPolicy } from "../network/index.js";
import type { RobotsFetchResult } from "../robots/policy-types.js";
import type { CrawlCounters } from "./types.js";
import type { RedirectTargetDecision } from "./redirect-target-policy.js";
import type { SeedResolver } from "./seed-resolver.js";

export interface RobotsRedirectDecider {
  decide(targetUrl: string, seedUrl: string): Promise<RedirectTargetDecision>;
}

export interface RobotsFetcherDependencies {
  readonly runId: string;
  readonly config: ResolvedCrawlConfig;
  readonly fetcher: HttpClient;
  readonly safety: NetworkSafetyPolicy;
  readonly redirects: RobotsRedirectDecider;
  readonly seeds: SeedResolver;
  readonly counters: CrawlCounters;
  readonly signal: AbortSignal;
}

export class RobotsFetcher {
  private readonly deps: RobotsFetcherDependencies;

  public constructor(deps: RobotsFetcherDependencies) {
    this.deps = deps;
  }

  public async fetch(url: string): Promise<RobotsFetchResult> {
    const fetchedAt = nowIso();
    const safety = await this.deps.safety.decide(url);
    if (!safety.allowed) {
      return this.failure(
        url,
        fetchedAt,
        new Error(safety.reason ?? "network safety rejected"),
      );
    }
    const seed = this.deps.seeds.forUrl(url) ?? this.deps.seeds.first();
    const seedUrl = seed?.normalizedUrl ?? url;
    const maxBytes = this.deps.config.robots.maxBytes;
    const result = await this.deps.fetcher.fetch(url, {
      requestId: makeId("robots", url),
      method: "GET",
      headers: {},
      signal: this.deps.signal,
      maxRedirects: Math.min(5, this.deps.config.network.maxRedirects),
      responseLimits: {
        maxCompressedBytes: maxBytes,
        maxDecompressedBytes: maxBytes,
        memoryThresholdBytes: maxBytes,
        spoolDirectory: null,
      },
      onRedirectTarget: (targetUrl) =>
        this.deps.redirects.decide(targetUrl, seedUrl),
    });
    this.deps.counters.robotsFilesFetched += 1;
    if (result.error !== null || result.body === null) {
      return {
        runId: this.deps.runId,
        statusCode: result.statusCode,
        text: null,
        finalUrl: result.finalUrl,
        error: new Error(result.error?.message ?? "robots fetch failed"),
        fetchedAt,
      };
    }
    try {
      const bytes = await readResponseBody(result.body);
      const decoded = decodeBody(
        bytes,
        result.headers.get("content-type"),
        "text",
        { kind: "replacement" },
      );
      return {
        runId: this.deps.runId,
        statusCode: result.statusCode,
        text: decoded.text,
        finalUrl: result.finalUrl,
        error: null,
        fetchedAt,
      };
    } finally {
      await disposeResponseBody(result.body);
    }
  }

  private failure(
    url: string,
    fetchedAt: string,
    error: Error,
  ): RobotsFetchResult {
    return {
      runId: this.deps.runId,
      statusCode: null,
      text: null,
      finalUrl: url,
      error,
      fetchedAt,
    };
  }
}
