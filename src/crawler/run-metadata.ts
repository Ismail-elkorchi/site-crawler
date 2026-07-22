import type { ResolvedCrawlConfig } from "../config/types.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { RunRuntimeMetadata } from "../results/run-metadata.js";

export function createRunRuntimeMetadata(
  config: ResolvedCrawlConfig,
  extensions: ResolvedCrawlerExtensions,
): RunRuntimeMetadata {
  const renderer = extensions.renderer;
  return {
    resultStorage: config.storage.type,
    frontierBackend: config.storage.frontierBackend,
    frontierOrder: config.storage.frontierOrder,
    httpProtocolPreference: config.network.protocolPreference,
    httpCacheEnabled: config.httpCache.enabled,
    sessionEnabled: config.session.enabled,
    persistedCookies: config.session.enabled && config.session.persistCookies,
    renderer:
      renderer === null
        ? null
        : { name: renderer.name, version: renderer.version },
  };
}

export function isSensitiveRun(config: ResolvedCrawlConfig): boolean {
  if (
    config.session.enabled ||
    config.session.initialCookies.length > 0 ||
    config.session.basicAuth.length > 0 ||
    config.session.bearerAuth.length > 0
  ) {
    return true;
  }
  return Object.keys(config.network.headers).some((name) => {
    const normalized = name.toLowerCase();
    return normalized === "authorization" || normalized === "cookie";
  });
}
