import type { ElementNode } from "@ismail-elkorchi/html-parser";
import type { ExtractedLink, LinkKind, LinkSource } from "../links/types.js";
import { normalizeUrl } from "../url/index.js";
import {
  getNamespacedAttribute,
  getUnnamespacedAttribute,
  relValues,
  spanToPosition,
} from "./facts/index.js";
import type { HtmlResourceReferenceFact } from "./types.js";

export function addAttributeReference(
  node: ElementNode,
  attribute: string,
  source: LinkSource,
  kind: LinkKind,
  baseUrl: string,
  facts: HtmlResourceReferenceFact[],
  links: ExtractedLink[],
): void {
  const raw = getUnnamespacedAttribute(node, attribute);
  if (raw !== null)
    addRawReference(node, raw, attribute, source, kind, baseUrl, facts, links);
}

export function addNamespacedAttributeReference(
  node: ElementNode,
  namespaceUri: string,
  localName: string,
  qualifiedName: string,
  source: LinkSource,
  kind: LinkKind,
  baseUrl: string,
  facts: HtmlResourceReferenceFact[],
  links: ExtractedLink[],
): void {
  const raw = getNamespacedAttribute(node, namespaceUri, localName);
  if (raw !== null)
    addRawReference(
      node,
      raw,
      qualifiedName,
      source,
      kind,
      baseUrl,
      facts,
      links,
    );
}

export function addRawReference(
  node: ElementNode,
  raw: string,
  attribute: string,
  source: LinkSource,
  kind: LinkKind,
  baseUrl: string,
  facts: HtmlResourceReferenceFact[],
  links: ExtractedLink[],
): void {
  facts.push(referenceFact(node, raw, attribute, kind, baseUrl));
  links.push({
    raw,
    source,
    kind,
    anchorText: null,
    rel: relValues(node),
    target: null,
    evidence: {
      kind: "html",
      method:
        attribute === "imagesrcset"
          ? "srcset"
          : attribute === "srcdoc"
            ? "srcdoc"
            : "attribute",
      element: node.localName,
      attribute,
      position: spanToPosition(node.span ?? null),
    },
  });
}

export function referenceFact(
  node: ElementNode,
  rawUrl: string,
  attributeName: string,
  kind: LinkKind,
  baseUrl: string,
): HtmlResourceReferenceFact {
  const normalized = normalizeUrl(rawUrl, baseUrl);
  return {
    elementName: node.localName,
    attributeName,
    rawUrl,
    resolvedUrl: normalized.ok ? normalized.value.resolvedUrl : null,
    normalizedUrl: normalized.ok ? normalized.value.normalizedUrl : null,
    kind,
    position: spanToPosition(node.span ?? null),
  };
}
