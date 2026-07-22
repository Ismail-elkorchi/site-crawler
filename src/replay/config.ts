import { parseCrawlConfig, resolveConfig } from "../config/public.js";
import type { ResolvedCrawlConfig } from "../config/types.js";

export function replayConfig(value: unknown): ResolvedCrawlConfig {
  if (!isRecord(value))
    throw new Error("Run configuration is missing or invalid.");
  const seeds = value["seeds"];
  if (!Array.isArray(seeds)) throw new Error("Resolved run seeds are invalid.");
  const seedUrls = seeds.map((seed) => {
    if (!isRecord(seed) || typeof seed["url"] !== "string") {
      throw new Error("Resolved run seed is invalid.");
    }
    return seed["url"];
  });
  const input: Readonly<Record<string, unknown>> = {
    ...value,
    seeds: seedUrls,
  };
  const sanitized = Object.fromEntries(
    Object.entries(input).filter(
      ([key]) =>
        key !== "seedUrls" && key !== "schemaId" && key !== "schemaVersion",
    ),
  );
  return resolveConfig(parseCrawlConfig(sanitized));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
