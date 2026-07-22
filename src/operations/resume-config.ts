import fs from "node:fs/promises";
import path from "node:path";
import type { CrawlConfig } from "../config/types.js";
import { replayConfig } from "../replay/config.js";
import type { ResolvedSeed, SeedInputConfig } from "../requests/types.js";

export async function configForResume(
  runDirectory: string,
): Promise<CrawlConfig> {
  const directory = path.resolve(runDirectory);
  const value: unknown = JSON.parse(
    await fs.readFile(path.join(directory, "config.resolved.json"), "utf8"),
  );
  const config = replayConfig(value);
  return {
    seeds: config.seeds.map(seedInput),
    scope: config.scope,
    limits: config.limits,
    networkSafety: config.networkSafety,
    robots: config.robots,
    sitemaps: config.sitemaps,
    feeds: config.feeds,
    jsDiscovery: config.jsDiscovery,
    cssDiscovery: config.cssDiscovery,
    network: config.network,
    session: config.session,
    httpCache: config.httpCache,
    responseLimits: config.responseLimits,
    parsing: config.parsing,
    rendering: config.rendering,
    storage: { ...config.storage, resumeFrom: directory },
    output: config.output,
  };
}

function seedInput(seed: ResolvedSeed): SeedInputConfig {
  return {
    url: seed.url,
    scope: seed.scope,
    ...(seed.maxDepth === null ? {} : { maxDepth: seed.maxDepth }),
    ...(seed.maxScheduledRequests === null
      ? {}
      : { maxScheduledRequests: seed.maxScheduledRequests }),
    ...(seed.label === null ? {} : { label: seed.label }),
  };
}
