import {
  findAllByTagName,
  HTML_NAMESPACE_URI,
  parseFragment,
  type ElementNode,
} from "@ismail-elkorchi/html-parser";
import type { ResolvedCrawlConfig } from "../config/types.js";
import { getUnnamespacedAttribute } from "./facts/index.js";

export function discoverSrcdocUrls(
  node: ElementNode,
  config: ResolvedCrawlConfig,
): readonly string[] {
  const srcdoc = getUnnamespacedAttribute(node, "srcdoc");
  if (srcdoc === null || srcdoc.length > config.parsing.html.maxInputBytes)
    return [];
  const fragment = parseFragment(
    srcdoc,
    {
      namespaceUri: HTML_NAMESPACE_URI,
      localName: "body",
    },
    {
      captureSpans: true,
      budgets: {
        maxInputBytes: config.parsing.html.maxInputBytes,
        maxNodes: Math.min(config.parsing.html.maxNodes, 10000),
        maxDepth: config.parsing.html.maxDepth,
      },
    },
  );
  const urls: string[] = [];
  for (const anchor of findAllByTagName(fragment, "a")) {
    const raw = getUnnamespacedAttribute(anchor, "href");
    if (raw !== null) urls.push(raw);
  }
  return urls;
}
