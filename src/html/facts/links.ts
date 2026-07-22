import {
  findAllByTagName,
  type DocumentTree,
  type ElementNode,
} from "@ismail-elkorchi/html-parser";
import { warning } from "../../diagnostics/factory.js";
import type { CrawlWarning } from "../../diagnostics/types.js";
import { normalizeUrl } from "../../url/index.js";
import type { AnchorFact, HreflangFact, LinkFact } from "../types.js";
import {
  elementAttributes,
  getUnnamespacedAttribute,
  relValues,
  spanToPosition,
} from "./attributes.js";

export interface BaseHrefResult {
  readonly fact: LinkFact | null;
  readonly warnings: readonly CrawlWarning[];
}

export function firstValidBaseHref(
  tree: DocumentTree,
  finalUrl: string,
): BaseHrefResult {
  const warnings: CrawlWarning[] = [];
  for (const node of findAllByTagName(tree, "base")) {
    const rawHref = getUnnamespacedAttribute(node, "href");
    if (rawHref === null) continue;
    const fact = linkFact(node, finalUrl);
    if (fact.normalizedUrl !== null) return { fact, warnings };
    warnings.push(
      warning("BASE_HREF_IGNORED", "Invalid base href was ignored", rawHref),
    );
  }
  return { fact: null, warnings };
}

export function firstLinkFact(
  nodes: readonly ElementNode[],
  baseUrl: string,
  predicate: (rel: readonly string[]) => boolean,
): LinkFact | null {
  for (const node of nodes) {
    if (predicate(relValues(node))) {
      const fact = linkFact(node, baseUrl);
      if (fact.rawHref !== null) return fact;
    }
  }
  return null;
}

export function linkFact(node: ElementNode, baseUrl: string): LinkFact {
  const rawHref = getUnnamespacedAttribute(node, "href");
  const resolved = resolveOptionalUrl(rawHref, baseUrl);
  return {
    rawHref,
    ...resolved,
    rel: relValues(node),
    rawAttributes: elementAttributes(node),
    position: spanToPosition(node.span ?? null),
  };
}

export function hreflangFact(node: ElementNode, baseUrl: string): HreflangFact {
  return {
    ...linkFact(node, baseUrl),
    hreflang: getUnnamespacedAttribute(node, "hreflang"),
  };
}

export function anchorFact(
  node: ElementNode,
  baseUrl: string,
  readText: (node: ElementNode) => string,
): AnchorFact {
  const rawHref = getUnnamespacedAttribute(node, "href");
  return {
    rawHref,
    ...resolveOptionalUrl(rawHref, baseUrl),
    text: readText(node).trim(),
    rel: relValues(node),
    target: getUnnamespacedAttribute(node, "target"),
    rawAttributes: elementAttributes(node),
    position: spanToPosition(node.span ?? null),
  };
}

export function resolveOptionalUrl(
  rawUrl: string | null,
  baseUrl: string,
): Pick<LinkFact, "resolvedUrl" | "normalizedUrl"> {
  if (rawUrl === null) {
    return { resolvedUrl: null, normalizedUrl: null };
  }
  const normalized = normalizeUrl(rawUrl, baseUrl);
  return normalized.ok
    ? {
        resolvedUrl: normalized.value.resolvedUrl,
        normalizedUrl: normalized.value.normalizedUrl,
      }
    : { resolvedUrl: null, normalizedUrl: null };
}
