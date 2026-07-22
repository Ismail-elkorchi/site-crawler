import { parse } from "@ismail-elkorchi/html-parser";
import type { ResolvedCrawlConfig } from "../config/types.js";
import { extractHtmlTreeFacts } from "./tree-extractor.js";
import type { HtmlExtractionContext, HtmlExtractionResult } from "./types.js";

export function extractHtmlFacts(
  html: string,
  finalUrl: string,
  config: ResolvedCrawlConfig,
  context: HtmlExtractionContext = {},
): HtmlExtractionResult {
  const tree = parse(html, {
    captureSpans: true,
    budgets: {
      maxInputBytes: config.parsing.html.maxInputBytes,
      maxNodes: config.parsing.html.maxNodes,
      maxDepth: config.parsing.html.maxDepth,
    },
  });
  return extractHtmlTreeFacts(tree.tree, finalUrl, config, context);
}

export type { HtmlExtractionResult } from "./types.js";
