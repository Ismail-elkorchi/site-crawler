import type { CrawlSeedInput, ResolvedSeed } from "../requests/types.js";
import type { ScopeConfig } from "../url/types.js";
import { normalizeUrl } from "../url/index.js";
import { mergeScopeWithBase } from "./merge.js";
export function normalizeSeeds(
  inputs: readonly CrawlSeedInput[],
  defaultSeedScope: ScopeConfig,
): readonly ResolvedSeed[] {
  return inputs.map((input) => {
    const seed = typeof input === "string" ? { url: input } : input;
    const normalized = normalizeUrl(seed.url, null);
    if (!normalized.ok) throw new Error(`Invalid seed URL: ${seed.url}`);
    return {
      url: seed.url,
      normalizedUrl: normalized.value.normalizedUrl,
      scope: mergeScopeWithBase(defaultSeedScope, seed.scope),
      maxDepth: seed.maxDepth ?? null,
      maxScheduledRequests: seed.maxScheduledRequests ?? null,
      label: seed.label ?? null,
    };
  });
}
