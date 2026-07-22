import type { ResolvedCrawlConfig } from "../config/types.js";
import type { ExtractedLink } from "../links/types.js";
import { scanCssUrls } from "./scanner.js";
import type { CssDiscoveredUrl } from "./types.js";

export function discoverCssUrls(
  stylesheet: string,
  config: ResolvedCrawlConfig,
): readonly CssDiscoveredUrl[] {
  return scanCssUrls(
    stylesheet.slice(0, config.cssDiscovery.maxStylesheetBytes),
    config.cssDiscovery.maxUrlsPerStylesheet,
  );
}

export function extractStaticCssLinks(
  stylesheet: string,
  config: ResolvedCrawlConfig,
): readonly ExtractedLink[] {
  return discoverCssUrls(stylesheet, config).map((candidate) => ({
    raw: candidate.rawUrl,
    source: "style-content",
    kind: candidate.method === "source-map" ? "source-map" : "css-discovery",
    anchorText: null,
    rel: [],
    target: null,
    evidence: {
      kind: "css",
      method: candidate.method,
      confidence: candidate.confidence,
      offset: candidate.offset,
    },
  }));
}

export type * from "./types.js";
