import { deepFreeze } from "./deep-freeze.js";
import {
  defaultFeeds,
  defaultLimits,
  defaultNetworkSafety,
  defaultOutput,
  defaultResponseLimits,
  defaultRobots,
} from "./defaults.js";
import { assertCrawlConfig } from "./input/parse-config.js";
import {
  mergeCss,
  mergeHttpCache,
  mergeJavascript,
  mergeNetwork,
  mergeParsing,
  mergeRendering,
  mergeScope,
  mergeSession,
  mergeSitemaps,
  mergeStorage,
} from "./merge.js";
import { normalizeSeeds } from "./seeds.js";
import type {
  CrawlConfig,
  CrawlLimits,
  CrawlLimitsInput,
  ResolvedCrawlConfig,
} from "./types.js";

export function resolveConfig(config: CrawlConfig): ResolvedCrawlConfig {
  assertCrawlConfig(config);
  const scope = mergeScope(config.scope);
  const seeds = normalizeSeeds(config.seeds, scope);
  return deepFreeze({
    schemaId: "site-crawler.resolvedConfig",
    schemaVersion: 1,
    seeds,
    seedUrls: seeds.map((seed) => seed.normalizedUrl),
    scope,
    limits: resolveLimits(config.limits),
    networkSafety: { ...defaultNetworkSafety, ...config.networkSafety },
    robots: { ...defaultRobots, ...config.robots },
    sitemaps: mergeSitemaps(config.sitemaps),
    feeds: { ...defaultFeeds, ...config.feeds },
    jsDiscovery: mergeJavascript(config.jsDiscovery),
    cssDiscovery: mergeCss(config.cssDiscovery),
    network: mergeNetwork(config.network),
    session: mergeSession(config.session),
    httpCache: mergeHttpCache(config.httpCache),
    responseLimits: { ...defaultResponseLimits, ...config.responseLimits },
    parsing: mergeParsing(config.parsing),
    rendering: mergeRendering(config.rendering),
    storage: mergeStorage(config.storage),
    output: { ...defaultOutput, ...config.output },
  });
}

function resolveLimits(input: CrawlLimitsInput | undefined): CrawlLimits {
  return {
    maxScheduledRequests:
      input?.maxScheduledRequests ?? defaultLimits.maxScheduledRequests,
    maxFetchedResources:
      input?.maxFetchedResources ?? defaultLimits.maxFetchedResources,
    maxDepth: input?.maxDepth ?? defaultLimits.maxDepth,
    maxRunTimeMs: input?.maxRunTimeMs ?? defaultLimits.maxRunTimeMs,
    maxQueueSize: input?.maxQueueSize ?? defaultLimits.maxQueueSize,
    maxDiscoveredLinksPerPage:
      input?.maxDiscoveredLinksPerPage ??
      defaultLimits.maxDiscoveredLinksPerPage,
    maxDownloadedBytes:
      input?.maxDownloadedBytes ?? defaultLimits.maxDownloadedBytes,
  };
}
