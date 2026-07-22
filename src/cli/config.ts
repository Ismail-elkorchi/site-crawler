import fs from "node:fs/promises";
import { parseCrawlConfig } from "../config/input/parse-config.js";
import type { CrawlConfig } from "../config/types.js";
import { safeJsonParse } from "../core/utils.js";
import type { CrawlCliOptions } from "./types.js";

export async function buildConfig(
  options: CrawlCliOptions,
): Promise<CrawlConfig> {
  const fileConfig =
    options.configPath === null
      ? null
      : await readConfigFile(options.configPath);
  const seed = options.seed ?? fileConfig?.seeds[0] ?? null;
  if (seed === null) throw new Error("A seed URL is required.");
  const scope = { ...fileConfig?.scope };
  if (options.scope !== null) scope.mode = options.scope;
  const limits = { ...fileConfig?.limits };
  if (options.maxScheduledRequests !== null) {
    limits.maxScheduledRequests = options.maxScheduledRequests;
  }
  if (options.maxFetchedResources !== null) {
    limits.maxFetchedResources = options.maxFetchedResources;
  }
  if (options.maxDepth !== null) limits.maxDepth = options.maxDepth;
  const robots = { ...fileConfig?.robots };
  if (options.respectRobots !== null) robots.enabled = options.respectRobots;
  const sitemaps = { ...fileConfig?.sitemaps };
  if (options.discoverSitemaps !== null)
    sitemaps.enabled = options.discoverSitemaps;
  const storage = { ...fileConfig?.storage };
  if (options.out !== null) storage.directory = options.out;
  return copyOptionalSections(
    {
      seeds: fileConfig?.seeds ?? [seed],
      scope,
      limits,
      robots,
      sitemaps,
      storage,
    },
    fileConfig,
  );
}

async function readConfigFile(filePath: string): Promise<CrawlConfig> {
  const text = await fs.readFile(filePath, "utf8");
  const parsed = safeJsonParse(text);
  if (!parsed.ok) throw new Error(`Invalid JSON config: ${parsed.error}`);
  return parseCrawlConfig(parsed.value);
}

function copyOptionalSections(
  base: CrawlConfig,
  source: CrawlConfig | null,
): CrawlConfig {
  if (source === null) return base;
  return {
    ...base,
    ...(source.feeds === undefined ? {} : { feeds: source.feeds }),
    ...(source.jsDiscovery === undefined
      ? {}
      : { jsDiscovery: source.jsDiscovery }),
    ...(source.network === undefined ? {} : { network: source.network }),
    ...(source.networkSafety === undefined
      ? {}
      : { networkSafety: source.networkSafety }),
    ...(source.responseLimits === undefined
      ? {}
      : { responseLimits: source.responseLimits }),
    ...(source.parsing === undefined ? {} : { parsing: source.parsing }),
    ...(source.rendering === undefined ? {} : { rendering: source.rendering }),
    ...(source.output === undefined ? {} : { output: source.output }),
  };
}
