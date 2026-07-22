import type { ResolvedCrawlConfig } from "../config/types.js";
import { crawlDelayFor, decisionForPath, unavailable } from "./matcher.js";
import { parseRobotsTxt } from "./parser.js";
import type { RobotsFetcher, RobotsPolicy } from "./policy-types.js";
import type { RobotsDecision, RobotsRecord } from "./types.js";

interface CachedPolicy {
  readonly policy: RobotsPolicy;
  readonly expiresAtMs: number;
}

export class RobotsService {
  private readonly cache = new Map<string, Promise<CachedPolicy>>();
  private readonly config: ResolvedCrawlConfig;
  private readonly fetcher: RobotsFetcher;
  private readonly record: (record: RobotsRecord) => Promise<void>;

  public constructor(
    config: ResolvedCrawlConfig,
    fetcher: RobotsFetcher,
    record: (record: RobotsRecord) => Promise<void>,
  ) {
    this.config = config;
    this.fetcher = fetcher;
    this.record = record;
  }

  public async decide(url: string, isSeed = false): Promise<RobotsDecision> {
    if (!this.config.robots.enabled) {
      return {
        allowed: true,
        reason: null,
        source: "disabled",
        matchedRule: null,
      };
    }
    const parsed = new URL(url);
    return decisionForPath(
      await this.policyFor(parsed.origin),
      this.config.robots.productToken,
      `${parsed.pathname}${parsed.search}`,
      isSeed,
    );
  }

  public async sitemapUrlsFor(seedUrl: string): Promise<readonly string[]> {
    if (!this.config.robots.enabled) return [];
    return (await this.policyFor(new URL(seedUrl).origin)).sitemaps;
  }

  public async crawlDelayMsFor(url: string): Promise<number | null> {
    if (!this.config.robots.enabled || !this.config.robots.respectCrawlDelay) {
      return null;
    }
    const seconds = crawlDelayFor(
      await this.policyFor(new URL(url).origin),
      this.config.robots.productToken,
    );
    return seconds === null ? null : seconds * 1000;
  }

  private async policyFor(origin: string): Promise<RobotsPolicy> {
    const existing = this.cache.get(origin);
    if (existing !== undefined) {
      const cached = await existing;
      if (cached.expiresAtMs > Date.now()) return cached.policy;
    }
    const stale = existing === undefined ? null : await existing;
    const loading = this.loadPolicy(origin, stale);
    this.cache.set(origin, loading);
    return (await loading).policy;
  }

  private async loadPolicy(
    origin: string,
    stale: CachedPolicy | null,
  ): Promise<CachedPolicy> {
    const robotsUrl = `${origin}/robots.txt`;
    const result = await this.fetcher(robotsUrl);
    const loaded = policyFromResult(result, robotsUrl, this.config);
    const useStale = loaded.policy.unavailableMode !== null && stale !== null;
    const policy = useStale ? stale.policy : loaded.policy;
    const expiresAtMs = Date.now() + this.config.robots.cacheTtlMs;
    await this.record(
      robotsRecord(
        origin,
        robotsUrl,
        result,
        policy,
        useStale ? "stale-cache" : loaded.source,
        expiresAtMs,
      ),
    );
    return { policy, expiresAtMs };
  }
}

function policyFromResult(
  result: Awaited<ReturnType<RobotsFetcher>>,
  robotsUrl: string,
  config: ResolvedCrawlConfig,
): { readonly policy: RobotsPolicy; readonly source: RobotsRecord["source"] } {
  if (result.error !== null || result.statusCode === null) {
    return {
      policy: unavailable(config.robots.onNetworkError),
      source: "fallback",
    };
  }
  if (result.statusCode >= 400 && result.statusCode < 500) {
    return { policy: unavailable(config.robots.on4xx), source: "fallback" };
  }
  if (result.statusCode >= 500 || result.text === null) {
    return { policy: unavailable(config.robots.on5xx), source: "fallback" };
  }
  return {
    policy: parseRobotsTxt(result.text, result.finalUrl ?? robotsUrl),
    source: "network",
  };
}

function robotsRecord(
  origin: string,
  requestedUrl: string,
  result: Awaited<ReturnType<RobotsFetcher>>,
  policy: RobotsPolicy,
  source: RobotsRecord["source"],
  expiresAtMs: number,
): RobotsRecord {
  return {
    schemaId: "site-crawler.robots",
    schemaVersion: 1,
    runId: result.runId,
    origin,
    requestedUrl,
    finalUrl: result.finalUrl,
    statusCode: result.statusCode,
    source,
    fallbackMode: policy.unavailableMode,
    groups: policy.groups.length,
    rules: policy.groups.reduce(
      (total, group) => total + group.rules.length,
      0,
    ),
    sitemaps: policy.sitemaps,
    fetchedAt: result.fetchedAt,
    expiresAt: new Date(expiresAtMs).toISOString(),
    error: result.error?.message ?? null,
  };
}
