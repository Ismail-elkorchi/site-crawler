import type { SourcePosition } from "../core/types.js";
import type { ExtractedLink, LinkKind, LinkSource } from "../links/types.js";
import type { LinkFact } from "./types.js";

export function htmlExtractedLink(
  raw: string,
  source: LinkSource,
  kind: LinkKind,
  anchorText: string | null,
  rel: readonly string[],
  target: string | null,
  element: string,
  attribute: string,
  position: SourcePosition | null,
  method: "attribute" | "srcset" = "attribute",
): ExtractedLink {
  return {
    raw,
    source,
    kind,
    anchorText,
    rel,
    target,
    evidence: { kind: "html", method, element, attribute, position },
  };
}

export function linkFactExtracted(
  link: LinkFact,
  rawHref: string,
  kind: LinkKind,
): ExtractedLink {
  return htmlExtractedLink(
    rawHref,
    "link[href]",
    kind,
    null,
    link.rel,
    null,
    "link",
    "href",
    link.position,
  );
}
