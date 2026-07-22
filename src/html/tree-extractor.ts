import {
  findAllByAttr,
  findAllByTagName,
  outline,
  type DocumentTree,
} from "@ismail-elkorchi/html-parser";
import type { ResolvedCrawlConfig } from "../config/types.js";
import { collectLinks } from "./link-collector.js";
import { collectResourceReferences } from "./resource-references.js";
import {
  anchorFact,
  findMetaRefresh,
  firstElement,
  firstLinkFact,
  firstMetaContent,
  firstValidBaseHref,
  formFact,
  headingFacts,
  hreflangFact,
  iframeFact,
  imageFact,
  jsonLdFact,
  linkFact,
  metaFact,
  microdataFact,
  scriptFact,
  textFactFromNode,
  getUnnamespacedAttribute,
  relValues,
  spanToPosition,
  parseXRobotsTag,
} from "./facts/index.js";
import type {
  HtmlExtractionContext,
  HtmlExtractionResult,
  HtmlPageFacts,
} from "./types.js";
import { createHtmlTextReader } from "./text-extraction.js";
export function extractHtmlTreeFacts(
  tree: DocumentTree,
  finalUrl: string,
  config: ResolvedCrawlConfig,
  context: HtmlExtractionContext = {},
): HtmlExtractionResult {
  const textReader = createHtmlTextReader(config);
  const base = firstValidBaseHref(tree, finalUrl);
  const baseHref = base.fact;
  const baseUrl = baseHref?.normalizedUrl ?? finalUrl;
  const metaTags = [...findAllByTagName(tree, "meta")].map(metaFact);
  const titles = [...findAllByTagName(tree, "title")].map((node) =>
    textFactFromNode(node, "title", textReader.completeText),
  );
  const title = titles[0] ?? null;
  const metaDescription = firstMetaContent(metaTags, "description");
  const viewport = firstMetaContent(metaTags, "viewport");
  const links = [...findAllByTagName(tree, "link")];
  const canonical = firstLinkFact(links, baseUrl, (rel) =>
    rel.includes("canonical"),
  );
  const alternates = links
    .filter((node) => relValues(node).includes("alternate"))
    .map((node) => linkFact(node, baseUrl));
  const hreflang = links
    .filter((node) => getUnnamespacedAttribute(node, "hreflang") !== null)
    .map((node) => hreflangFact(node, baseUrl));
  const anchors = [...findAllByTagName(tree, "a")].map((node) =>
    anchorFact(node, baseUrl, textReader.completeText),
  );
  const areas = [...findAllByTagName(tree, "area")].map((node) =>
    anchorFact(node, baseUrl, textReader.completeText),
  );
  const images = [...findAllByTagName(tree, "img")].map((node) =>
    imageFact(node, baseUrl),
  );
  const sources = [...findAllByTagName(tree, "source")];
  const iframes = [...findAllByTagName(tree, "iframe")].map((node) =>
    iframeFact(node, baseUrl),
  );
  const scriptNodes = [...findAllByTagName(tree, "script")];
  const scripts = scriptNodes.map((node) =>
    scriptFact(node, baseUrl, textReader.completeText),
  );
  const stylesheets = links
    .filter((node) => relValues(node).includes("stylesheet"))
    .map((node) => linkFact(node, baseUrl));
  const forms = [...findAllByTagName(tree, "form")].map((node) =>
    formFact(node, baseUrl),
  );
  const metaRefresh = findMetaRefresh(metaTags, baseUrl);
  const references = collectResourceReferences(
    tree,
    baseUrl,
    config,
    textReader.completeText,
  );
  const openGraph = metaTags.filter(
    (meta) => meta.property?.startsWith("og:") === true,
  );
  const socialMeta = metaTags.filter(
    (meta) =>
      meta.name?.startsWith("twitter:") === true ||
      meta.property?.startsWith("twitter:") === true,
  );
  const jsonLdBlocks = scriptNodes
    .filter(
      (node) =>
        (getUnnamespacedAttribute(node, "type") ?? "").toLowerCase() ===
        "application/ld+json",
    )
    .map((node) => jsonLdFact(node, textReader.completeText));
  const microdata = [...findAllByAttr(tree, "itemscope")].map(microdataFact);
  const visible = textReader.visibleText(tree);
  const allText = textReader.documentText(tree);
  const documentOutline = outline(tree);
  const productToken =
    typeof config.robots.productToken === "string"
      ? config.robots.productToken.toLowerCase()
      : "robots";
  const facts: HtmlPageFacts = {
    schemaId: "site-crawler.htmlPageFacts",
    schemaVersion: 1,
    title,
    titles,
    metaDescription,
    metaRobots: metaTags.filter(
      (meta) => meta.name === "robots" || meta.name === productToken,
    ),
    xRobotsTag: parseXRobotsTag(context.xRobotsTag ?? null),
    metaTags,
    canonical,
    alternates,
    hreflang,
    baseHref,
    htmlLang: getUnnamespacedAttribute(firstElement(tree, "html"), "lang"),
    charset: context.encoding ?? null,
    viewport,
    headings: headingFacts(tree, textReader.completeText),
    anchors,
    areas,
    images,
    iframes,
    scripts,
    stylesheets,
    forms,
    resourceReferences: references.facts,
    metaRefresh,
    openGraph,
    socialMeta,
    jsonLdBlocks,
    microdata,
    visibleText: visible,
    textContent: allText,
    outline: {
      entries: documentOutline.entries.map((entry) => ({
        depth: entry.depth,
        tagName: entry.localName,
        text: entry.text,
      })),
    },
    warnings: base.warnings,
    parserDiagnostics: tree.errors.map((error) => ({
      level: "error",
      code: error.parseErrorId,
      message: error.message,
      position: spanToPosition(error.span ?? null),
    })),
    parserBudgets: {
      maxInputBytes: config.parsing.html.maxInputBytes,
      maxNodes: config.parsing.html.maxNodes,
      maxDepth: config.parsing.html.maxDepth,
      maxTextBytes: config.parsing.html.maxTextBytes,
      status: "within-limits",
    },
  };
  const extractedLinks = collectLinks({
    anchors,
    areas,
    canonical,
    alternates,
    hreflang,
    stylesheets,
    images,
    sources,
    iframes,
    scripts,
    forms,
    metaRefresh,
    additional: references.links,
  });
  return { facts, links: extractedLinks };
}
