import {
  findAllByTagName,
  HTML_NAMESPACE_URI,
  serialize,
  walkElements,
  type DocumentTree,
  type ElementNode,
} from "@ismail-elkorchi/html-parser";
import type {
  FormFact,
  HeadingFact,
  IframeFact,
  ImageFact,
  JsonLdBlockFact,
  MicrodataFact,
  ScriptFact,
} from "../types.js";
import {
  elementAttributes,
  getUnnamespacedAttribute,
  spanToPosition,
} from "./attributes.js";
import { resolveOptionalUrl } from "./links.js";
import { parseSrcset } from "./srcset.js";

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

export function firstElement(
  tree: DocumentTree,
  tagName: string,
): ElementNode | null {
  for (const node of findAllByTagName(tree, tagName)) return node;
  return null;
}

export function headingFacts(
  tree: DocumentTree,
  readText: (node: ElementNode) => string,
): readonly HeadingFact[] {
  const facts: HeadingFact[] = [];
  walkElements(tree, (node) => {
    if (
      node.namespaceUri !== HTML_NAMESPACE_URI ||
      !isHeadingTag(node.localName)
    )
      return;
    facts.push({
      level: headingLevel(node.localName),
      text: readText(node).trim(),
      rawHtml: serialize(node),
      id: getUnnamespacedAttribute(node, "id"),
      position: spanToPosition(node.span ?? null),
    });
  });
  return facts;
}

export function imageFact(node: ElementNode, baseUrl: string): ImageFact {
  const rawSrc = getUnnamespacedAttribute(node, "src");
  return {
    rawSrc,
    ...resolveOptionalUrl(rawSrc, baseUrl),
    alt: getUnnamespacedAttribute(node, "alt"),
    srcset: parseSrcset(getUnnamespacedAttribute(node, "srcset")),
    loading: getUnnamespacedAttribute(node, "loading"),
    rawAttributes: elementAttributes(node),
    position: spanToPosition(node.span ?? null),
  };
}

export function iframeFact(node: ElementNode, baseUrl: string): IframeFact {
  const rawSrc = getUnnamespacedAttribute(node, "src");
  return {
    rawSrc,
    ...resolveOptionalUrl(rawSrc, baseUrl),
    rawAttributes: elementAttributes(node),
    position: spanToPosition(node.span ?? null),
  };
}

export function scriptFact(
  node: ElementNode,
  baseUrl: string,
  readText: (node: ElementNode) => string,
): ScriptFact {
  const rawSrc = getUnnamespacedAttribute(node, "src");
  return {
    rawSrc,
    ...resolveOptionalUrl(rawSrc, baseUrl),
    type: getUnnamespacedAttribute(node, "type"),
    text: rawSrc === null ? readText(node).trim() : null,
    rawAttributes: elementAttributes(node),
    position: spanToPosition(node.span ?? null),
  };
}

export function formFact(node: ElementNode, baseUrl: string): FormFact {
  const rawAction = getUnnamespacedAttribute(node, "action");
  return {
    method: getUnnamespacedAttribute(node, "method"),
    rawAction,
    ...resolveOptionalUrl(rawAction, baseUrl),
    rawAttributes: elementAttributes(node),
    position: spanToPosition(node.span ?? null),
  };
}

export function jsonLdFact(
  node: ElementNode,
  readText: (node: ElementNode) => string,
): JsonLdBlockFact {
  return {
    text: readText(node).trim(),
    rawAttributes: elementAttributes(node),
    position: spanToPosition(node.span ?? null),
  };
}

export function microdataFact(node: ElementNode): MicrodataFact {
  return {
    itemtype: getUnnamespacedAttribute(node, "itemtype"),
    itemprop: getUnnamespacedAttribute(node, "itemprop"),
    itemscope: getUnnamespacedAttribute(node, "itemscope") !== null,
    position: spanToPosition(node.span ?? null),
  };
}

function isHeadingTag(
  tagName: string,
): tagName is (typeof HEADING_TAGS)[number] {
  return HEADING_TAGS.some((heading) => heading === tagName);
}

function headingLevel(
  tagName: (typeof HEADING_TAGS)[number],
): HeadingFact["level"] {
  switch (tagName) {
    case "h1":
      return 1;
    case "h2":
      return 2;
    case "h3":
      return 3;
    case "h4":
      return 4;
    case "h5":
      return 5;
    case "h6":
      return 6;
  }
}
