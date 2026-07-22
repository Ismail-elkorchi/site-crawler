import type { ElementNode } from "@ismail-elkorchi/html-parser";
import type { MetaFact, MetaRefreshFact, TextFact } from "../types.js";
import { elementAttributes, spanToPosition } from "./attributes.js";
import { resolveOptionalUrl } from "./links.js";

export function metaFact(node: ElementNode): MetaFact {
  const attributes = elementAttributes(node);
  return {
    name: lowerOrNull(attributes["name"] ?? null),
    property: lowerOrNull(attributes["property"] ?? null),
    httpEquiv: lowerOrNull(attributes["http-equiv"] ?? null),
    content: attributes["content"] ?? null,
    rawAttributes: attributes,
    position: spanToPosition(node.span ?? null),
  };
}

export function firstMetaContent(
  metaTags: readonly MetaFact[],
  name: string,
): TextFact | null {
  const match = metaTags.find(
    (meta) => meta.name === name || meta.property === name,
  );
  if (match?.content === undefined || match.content === null) return null;
  return {
    raw: match.content,
    value: match.content.trim(),
    sourcePath: `meta:${name}`,
    position: match.position,
  };
}

export function textFactFromNode(
  node: ElementNode,
  sourcePath: string,
  readText: (node: ElementNode) => string,
): TextFact {
  const raw = readText(node);
  return {
    raw,
    value: raw.trim(),
    sourcePath,
    position: spanToPosition(node.span ?? null),
  };
}

export function findMetaRefresh(
  metaTags: readonly MetaFact[],
  baseUrl: string,
): MetaRefreshFact | null {
  const refresh = metaTags.find(
    (meta) => meta.httpEquiv === "refresh" && meta.content !== null,
  );
  if (refresh?.content === undefined || refresh.content === null) return null;

  const separator = refresh.content.indexOf(";");
  const delayText =
    separator < 0
      ? refresh.content.trim()
      : refresh.content.slice(0, separator).trim();
  const targetText =
    separator < 0 ? null : refresh.content.slice(separator + 1).trim();
  const seconds = Number(delayText);
  const rawUrl = parseRefreshTarget(targetText);

  return {
    content: refresh.content,
    seconds: Number.isFinite(seconds) && seconds >= 0 ? seconds : null,
    rawUrl,
    ...resolveOptionalUrl(rawUrl, baseUrl),
  };
}

function lowerOrNull(value: string | null): string | null {
  return value === null ? null : value.toLowerCase();
}

function parseRefreshTarget(value: string | null): string | null {
  if (value === null || value.length === 0) return null;
  const withoutPrefix = /^url\s*=/iu.test(value)
    ? value.replace(/^url\s*=\s*/iu, "")
    : value;
  const trimmed = withoutPrefix.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed.length === 0 ? null : trimmed;
}
