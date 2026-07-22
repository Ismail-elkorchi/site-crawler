import {
  HTML_NAMESPACE_URI,
  SVG_NAMESPACE_URI,
  XLINK_NAMESPACE_URI,
  type ElementNode,
} from "@ismail-elkorchi/html-parser";
import type { ExtractedLink } from "../links/types.js";
import {
  getUnnamespacedAttribute,
  parseSrcset,
  relValues,
} from "./facts/index.js";
import {
  addAttributeReference,
  addNamespacedAttributeReference,
  addRawReference,
} from "./resource-reference-builder.js";
import type { HtmlResourceReferenceFact } from "./types.js";

export function collectElementReferences(
  node: ElementNode,
  baseUrl: string,
  facts: HtmlResourceReferenceFact[],
  links: ExtractedLink[],
): void {
  if (node.namespaceUri === SVG_NAMESPACE_URI) {
    collectSvgReferences(node, baseUrl, facts, links);
    return;
  }
  if (node.namespaceUri !== HTML_NAMESPACE_URI) return;
  switch (node.localName) {
    case "audio":
      addAttributeReference(
        node,
        "src",
        "audio[src]",
        "media",
        baseUrl,
        facts,
        links,
      );
      return;
    case "video":
      addAttributeReference(
        node,
        "src",
        "video[src]",
        "media",
        baseUrl,
        facts,
        links,
      );
      addAttributeReference(
        node,
        "poster",
        "video[poster]",
        "image",
        baseUrl,
        facts,
        links,
      );
      return;
    case "track":
      addAttributeReference(
        node,
        "src",
        "track[src]",
        "media",
        baseUrl,
        facts,
        links,
      );
      return;
    case "object":
      addAttributeReference(
        node,
        "data",
        "object[data]",
        "object",
        baseUrl,
        facts,
        links,
      );
      return;
    case "embed":
      addAttributeReference(
        node,
        "src",
        "embed[src]",
        "object",
        baseUrl,
        facts,
        links,
      );
      return;
    case "input":
      addAttributeReference(
        node,
        "src",
        "input[src]",
        "image",
        baseUrl,
        facts,
        links,
      );
      addAttributeReference(
        node,
        "formaction",
        "input[formaction]",
        "form",
        baseUrl,
        facts,
        links,
      );
      return;
    case "button":
      addAttributeReference(
        node,
        "formaction",
        "button[formaction]",
        "form",
        baseUrl,
        facts,
        links,
      );
      return;
    case "link":
      collectLinkReferences(node, baseUrl, facts, links);
      return;
    default:
      return;
  }
}

function collectSvgReferences(
  node: ElementNode,
  baseUrl: string,
  facts: HtmlResourceReferenceFact[],
  links: ExtractedLink[],
): void {
  if (
    node.localName !== "svg" &&
    node.localName !== "use" &&
    node.localName !== "image"
  )
    return;
  addAttributeReference(
    node,
    "href",
    "svg[href]",
    "asset",
    baseUrl,
    facts,
    links,
  );
  addNamespacedAttributeReference(
    node,
    XLINK_NAMESPACE_URI,
    "href",
    "xlink:href",
    "svg[xlink:href]",
    "asset",
    baseUrl,
    facts,
    links,
  );
}

function collectLinkReferences(
  node: ElementNode,
  baseUrl: string,
  facts: HtmlResourceReferenceFact[],
  links: ExtractedLink[],
): void {
  for (const candidate of parseSrcset(
    getUnnamespacedAttribute(node, "imagesrcset"),
  ))
    addRawReference(
      node,
      candidate,
      "imagesrcset",
      "link[imagesrcset]",
      "image",
      baseUrl,
      facts,
      links,
    );
  const rel = relValues(node);
  if (rel.includes("manifest"))
    addAttributeReference(
      node,
      "href",
      "link[href]",
      "manifest",
      baseUrl,
      facts,
      links,
    );
  if (rel.includes("preload") || rel.includes("modulepreload"))
    addAttributeReference(
      node,
      "href",
      "link[href]",
      "preload",
      baseUrl,
      facts,
      links,
    );
  if (
    rel.includes("prefetch") ||
    rel.includes("prerender") ||
    rel.includes("preconnect") ||
    rel.includes("dns-prefetch")
  )
    addAttributeReference(
      node,
      "href",
      "link[href]",
      "prefetch",
      baseUrl,
      facts,
      links,
    );
}
