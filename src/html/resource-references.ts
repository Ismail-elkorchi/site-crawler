import {
  HTML_NAMESPACE_URI,
  walkElements,
  type DocumentTree,
  type ElementNode,
} from "@ismail-elkorchi/html-parser";
import { discoverCssUrls } from "../css/index.js";
import type { ResolvedCrawlConfig } from "../config/types.js";
import type { ExtractedLink, LinkSource } from "../links/types.js";
import type { HtmlResourceReferenceFact } from "./types.js";
import { getUnnamespacedAttribute } from "./facts/index.js";
import { collectElementReferences } from "./resource-elements.js";
import {
  addRawReference,
  referenceFact,
} from "./resource-reference-builder.js";
import { discoverSrcdocUrls } from "./srcdoc-references.js";

export interface HtmlReferenceCollection {
  readonly facts: readonly HtmlResourceReferenceFact[];
  readonly links: readonly ExtractedLink[];
}

export function collectResourceReferences(
  tree: DocumentTree,
  baseUrl: string,
  config: ResolvedCrawlConfig,
  readText: (node: ElementNode) => string,
): HtmlReferenceCollection {
  const facts: HtmlResourceReferenceFact[] = [];
  const links: ExtractedLink[] = [];
  walkElements(tree, (node) => {
    collectElementReferences(node, baseUrl, facts, links);
    if (config.cssDiscovery.enabled)
      collectInlineCss(node, baseUrl, config, readText, facts, links);
    if (node.namespaceUri === HTML_NAMESPACE_URI && node.localName === "iframe")
      collectSrcdoc(node, baseUrl, config, facts, links);
  });
  return { facts, links };
}

function collectInlineCss(
  node: ElementNode,
  baseUrl: string,
  config: ResolvedCrawlConfig,
  readText: (node: ElementNode) => string,
  facts: HtmlResourceReferenceFact[],
  links: ExtractedLink[],
): void {
  const style = getUnnamespacedAttribute(node, "style");
  if (style !== null)
    addCssDiscoveries(
      node,
      style,
      "style",
      "style[attribute]",
      baseUrl,
      config,
      facts,
      links,
    );
  if (node.localName === "style")
    addCssDiscoveries(
      node,
      readText(node),
      "text",
      "style-content",
      baseUrl,
      config,
      facts,
      links,
    );
}

function collectSrcdoc(
  node: ElementNode,
  baseUrl: string,
  config: ResolvedCrawlConfig,
  facts: HtmlResourceReferenceFact[],
  links: ExtractedLink[],
): void {
  for (const raw of discoverSrcdocUrls(node, config))
    addRawReference(
      node,
      raw,
      "srcdoc",
      "iframe[srcdoc]",
      "navigation",
      baseUrl,
      facts,
      links,
    );
}

function addCssDiscoveries(
  node: ElementNode,
  stylesheet: string,
  attribute: string,
  source: LinkSource,
  baseUrl: string,
  config: ResolvedCrawlConfig,
  facts: HtmlResourceReferenceFact[],
  links: ExtractedLink[],
): void {
  for (const candidate of discoverCssUrls(stylesheet, config)) {
    const fact = referenceFact(
      node,
      candidate.rawUrl,
      attribute,
      "css-discovery",
      baseUrl,
    );
    facts.push(fact);
    links.push({
      raw: candidate.rawUrl,
      source,
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
    });
  }
}
