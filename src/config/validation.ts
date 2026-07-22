import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { ResolvedSeed } from "../requests/types.js";
import { validateRuntimeConfig } from "./validation-runtime.js";
import type { ResolvedCrawlConfig } from "./types.js";

export function validateConfig(
  config: ResolvedCrawlConfig,
  extensions?: ResolvedCrawlerExtensions,
): void {
  if (config.seeds.length === 0) {
    throw new Error("At least one seed URL is required.");
  }
  for (const seed of config.seeds) validateSeed(seed);
  positive(config.limits.maxScheduledRequests, "limits.maxScheduledRequests");
  positive(config.limits.maxFetchedResources, "limits.maxFetchedResources");
  nonNegative(config.limits.maxDepth, "limits.maxDepth");
  positive(config.limits.maxRunTimeMs, "limits.maxRunTimeMs");
  positive(config.limits.maxQueueSize, "limits.maxQueueSize");
  positive(
    config.limits.maxDiscoveredLinksPerPage,
    "limits.maxDiscoveredLinksPerPage",
  );
  positive(config.limits.maxDownloadedBytes, "limits.maxDownloadedBytes");
  positive(config.networkSafety.dnsTimeoutMs, "networkSafety.dnsTimeoutMs");
  positive(config.networkSafety.dnsCacheTtlMs, "networkSafety.dnsCacheTtlMs");
  positive(config.scope.maxUrlLength, "scope.maxUrlLength");
  positive(config.scope.maxPathSegments, "scope.maxPathSegments");
  nonNegative(config.scope.maxQueryParams, "scope.maxQueryParams");
  positive(config.scope.maxUrlsPerDirectory, "scope.maxUrlsPerDirectory");
  positive(config.scope.maxUrlsPerPathPattern, "scope.maxUrlsPerPathPattern");
  positive(config.network.maxConcurrency, "network.maxConcurrency");
  positive(
    config.network.maxConcurrencyPerOrigin,
    "network.maxConcurrencyPerOrigin",
  );
  positive(config.network.requestTimeoutMs, "network.requestTimeoutMs");
  positive(config.network.connectTimeoutMs, "network.connectTimeoutMs");
  positive(config.network.firstByteTimeoutMs, "network.firstByteTimeoutMs");
  nonNegative(config.network.maxRedirects, "network.maxRedirects");
  nonNegative(config.network.retries, "network.retries");
  nonNegative(
    config.network.minDelayMsPerOrigin,
    "network.minDelayMsPerOrigin",
  );
  positive(
    config.network.autoThrottle.targetConcurrencyPerOrigin,
    "network.autoThrottle.targetConcurrencyPerOrigin",
  );
  nonNegative(
    config.network.autoThrottle.startDelayMs,
    "network.autoThrottle.startDelayMs",
  );
  nonNegative(
    config.network.autoThrottle.minDelayMs,
    "network.autoThrottle.minDelayMs",
  );
  positive(
    config.network.autoThrottle.maxDelayMs,
    "network.autoThrottle.maxDelayMs",
  );
  if (
    config.network.autoThrottle.smoothing <= 0 ||
    config.network.autoThrottle.smoothing > 1
  ) {
    throw new Error(
      "network.autoThrottle.smoothing must be greater than 0 and at most 1.",
    );
  }
  if (
    config.network.autoThrottle.minDelayMs >
    config.network.autoThrottle.maxDelayMs
  ) {
    throw new Error(
      "network.autoThrottle.minDelayMs must not exceed maxDelayMs.",
    );
  }
  if (config.network.maxRequestsPerMinutePerOrigin !== null) {
    positive(
      config.network.maxRequestsPerMinutePerOrigin,
      "network.maxRequestsPerMinutePerOrigin",
    );
  }
  positive(
    config.responseLimits.maxCompressedBytes,
    "responseLimits.maxCompressedBytes",
  );
  positive(
    config.responseLimits.maxDecompressedBytes,
    "responseLimits.maxDecompressedBytes",
  );
  positive(
    config.responseLimits.memoryThresholdBytes,
    "responseLimits.memoryThresholdBytes",
  );
  if (
    config.responseLimits.memoryThresholdBytes >
    config.responseLimits.maxDecompressedBytes
  ) {
    throw new Error(
      "responseLimits.memoryThresholdBytes must not exceed maxDecompressedBytes.",
    );
  }
  positive(config.parsing.html.maxInputBytes, "parsing.html.maxInputBytes");
  positive(config.parsing.html.maxNodes, "parsing.html.maxNodes");
  positive(config.parsing.html.maxDepth, "parsing.html.maxDepth");
  positive(config.parsing.html.maxTextBytes, "parsing.html.maxTextBytes");
  positive(config.parsing.xml.maxStreamBytes, "parsing.xml.maxStreamBytes");
  positive(config.parsing.xml.maxNodes, "parsing.xml.maxNodes");
  positive(config.parsing.xml.maxDepth, "parsing.xml.maxDepth");
  positive(config.parsing.xml.maxTextBytes, "parsing.xml.maxTextBytes");
  positive(config.robots.maxBytes, "robots.maxBytes");
  positive(config.robots.cacheTtlMs, "robots.cacheTtlMs");
  productToken(config.robots.productToken);
  positive(config.sitemaps.maxSitemapFiles, "sitemaps.maxSitemapFiles");
  positive(
    config.sitemaps.maxEntriesPerSitemap,
    "sitemaps.maxEntriesPerSitemap",
  );
  positive(config.sitemaps.maxTotalEntries, "sitemaps.maxTotalEntries");
  nonNegative(
    config.sitemaps.maxSitemapIndexDepth,
    "sitemaps.maxSitemapIndexDepth",
  );
  positive(config.jsDiscovery.maxScriptBytes, "jsDiscovery.maxScriptBytes");
  positive(
    config.cssDiscovery.maxStylesheetBytes,
    "cssDiscovery.maxStylesheetBytes",
  );
  nonNegative(
    config.cssDiscovery.maxUrlsPerStylesheet,
    "cssDiscovery.maxUrlsPerStylesheet",
  );
  positive(config.httpCache.maxBodyBytes, "httpCache.maxBodyBytes");
  if (config.session.persistCookies && !config.session.enabled) {
    throw new Error(
      "session.persistCookies requires session.enabled to be true.",
    );
  }
  if (config.session.persistCookies && config.storage.type === "memory") {
    throw new Error(
      "Persistent cookies require filesystem-backed crawl storage.",
    );
  }
  if (
    config.session.cookieFile !== null &&
    config.session.cookieFile.trim().length === 0
  ) {
    throw new Error("session.cookieFile must not be empty.");
  }
  nonNegative(
    config.jsDiscovery.maxUrlsPerScript,
    "jsDiscovery.maxUrlsPerScript",
  );
  validateRuntimeConfig(config, extensions);
}

function validateSeed(seed: ResolvedSeed): void {
  const url = new URL(seed.normalizedUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported seed protocol: ${url.protocol}`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("Seed URLs containing credentials are rejected.");
  }
  if (seed.maxDepth !== null) nonNegative(seed.maxDepth, "seed.maxDepth");
  if (seed.maxScheduledRequests !== null) {
    positive(seed.maxScheduledRequests, "seed.maxScheduledRequests");
  }
}

function productToken(value: string): void {
  if (!/^[A-Za-z_-]+$/u.test(value)) {
    throw new Error(
      "robots.productToken must contain only ASCII letters, underscore, or hyphen.",
    );
  }
}

function positive(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function nonNegative(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
}
