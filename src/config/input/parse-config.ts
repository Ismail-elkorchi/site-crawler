import type { CrawlConfig } from "../types.js";
import { assertPlainData } from "./assert-data.js";
import {
  assertCss,
  assertFeeds,
  assertJavascript,
  assertLimits,
  assertRobots,
  assertScopeConfig,
  assertSitemaps,
} from "./assert-discovery.js";
import {
  assertNetwork,
  assertNetworkSafety,
  assertResponseLimits,
} from "./assert-network.js";
import {
  assertOutput,
  assertParsing,
  assertRendering,
  assertStorage,
} from "./assert-runtime.js";
import { assertSeeds } from "./assert-seed.js";
import { assertHttpCache, assertSession } from "./assert-session.js";
import { assertKnownKeys, assertRecord, optional } from "./assert-utils.js";

const CONFIG_KEYS = [
  "seeds",
  "scope",
  "limits",
  "networkSafety",
  "robots",
  "sitemaps",
  "feeds",
  "jsDiscovery",
  "cssDiscovery",
  "network",
  "session",
  "httpCache",
  "responseLimits",
  "parsing",
  "rendering",
  "storage",
  "output",
] as const;

export function parseCrawlConfig(value: unknown): CrawlConfig {
  assertCrawlConfig(value);
  return value;
}

export function assertCrawlConfig(
  value: unknown,
): asserts value is CrawlConfig {
  assertPlainData(value);
  assertRecord(value, "config");
  assertKnownKeys(value, CONFIG_KEYS, "config");
  assertSeeds(value["seeds"], "config.seeds");
  optional(value, "scope", assertScopeConfig, "config");
  optional(value, "limits", assertLimits, "config");
  optional(value, "networkSafety", assertNetworkSafety, "config");
  optional(value, "robots", assertRobots, "config");
  optional(value, "sitemaps", assertSitemaps, "config");
  optional(value, "feeds", assertFeeds, "config");
  optional(value, "jsDiscovery", assertJavascript, "config");
  optional(value, "cssDiscovery", assertCss, "config");
  optional(value, "network", assertNetwork, "config");
  optional(value, "session", assertSession, "config");
  optional(value, "httpCache", assertHttpCache, "config");
  optional(value, "responseLimits", assertResponseLimits, "config");
  optional(value, "parsing", assertParsing, "config");
  optional(value, "rendering", assertRendering, "config");
  optional(value, "storage", assertStorage, "config");
  optional(value, "output", assertOutput, "config");
}
