import type { EnqueueDecision } from "../links/types.js";
import type { ResolvedSeed } from "../requests/types.js";
import type { CrawledHtmlPage } from "./types.js";
export interface FeedAlternateDiscoveryDependencies {
  enqueue(
    rawUrl: string,
    referrerUrl: string | null,
    source: "feed",
    depth: number,
    seed: ResolvedSeed,
  ): Promise<EnqueueDecision>;
}
export async function enqueueFeedAlternates(
  deps: FeedAlternateDiscoveryDependencies,
  page: CrawledHtmlPage,
  finalUrl: string,
  depth: number,
  seed: ResolvedSeed | null,
): Promise<void> {
  if (seed === null) return;
  for (const alternate of page.facts.alternates) {
    const type = alternate.rawAttributes["type"]?.toLowerCase() ?? "";
    if (
      (type.includes("rss") || type.includes("atom")) &&
      alternate.normalizedUrl !== null
    )
      await deps.enqueue(
        alternate.normalizedUrl,
        finalUrl,
        "feed",
        depth,
        seed,
      );
  }
}
