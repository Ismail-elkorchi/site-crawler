import type { ResolvedCrawlConfig } from "../config/types.js";
import type { ExtractedLink } from "../links/types.js";
import { discoverJavascriptAst } from "./ast.js";
import { JavascriptCandidateSet } from "./candidates.js";
import { discoverJavascriptRegex, discoverSourceMaps } from "./regex.js";
import type { JavascriptDiscoveredUrl } from "./types.js";

export function discoverJavascriptUrls(
  script: string,
  config: ResolvedCrawlConfig,
): readonly JavascriptDiscoveredUrl[] {
  const limited = script.slice(0, config.jsDiscovery.maxScriptBytes);
  const candidates = new JavascriptCandidateSet(
    config.jsDiscovery.maxUrlsPerScript,
  );
  if (config.jsDiscovery.mode === "regex")
    discoverJavascriptRegex(limited, candidates);
  if (config.jsDiscovery.mode === "ast") {
    discoverJavascriptAst(limited, candidates);
    discoverSourceMaps(limited, candidates);
  }
  if (config.jsDiscovery.mode === "hybrid") {
    discoverJavascriptAst(limited, candidates);
    discoverJavascriptRegex(limited, candidates);
  }
  return candidates.values();
}

export function extractStaticJavascriptLinks(
  script: string,
  config: ResolvedCrawlConfig,
): readonly ExtractedLink[] {
  return discoverJavascriptUrls(script, config).map((candidate) => ({
    raw: candidate.rawUrl,
    source: "script-content",
    kind: candidate.method === "source-map" ? "source-map" : "script-discovery",
    anchorText: null,
    rel: [],
    target: null,
    evidence: {
      kind: "javascript",
      method: candidate.method,
      confidence: candidate.confidence,
      offset: candidate.offset,
    },
  }));
}

export type * from "./types.js";
