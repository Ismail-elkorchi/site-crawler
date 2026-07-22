import type { ElementNode } from "@ismail-elkorchi/html-parser";
import type { ExtractedLink } from "../links/types.js";
import type {
  AnchorFact,
  FormFact,
  HreflangFact,
  IframeFact,
  ImageFact,
  LinkFact,
  MetaRefreshFact,
  ScriptFact,
} from "./types.js";
import {
  getUnnamespacedAttribute,
  parseSrcset,
  spanToPosition,
} from "./facts/index.js";
import { htmlExtractedLink, linkFactExtracted } from "./extracted-link.js";

interface LinkCollectionInput {
  readonly anchors: readonly AnchorFact[];
  readonly areas: readonly AnchorFact[];
  readonly canonical: LinkFact | null;
  readonly alternates: readonly LinkFact[];
  readonly hreflang: readonly HreflangFact[];
  readonly stylesheets: readonly LinkFact[];
  readonly images: readonly ImageFact[];
  readonly sources: readonly ElementNode[];
  readonly iframes: readonly IframeFact[];
  readonly scripts: readonly ScriptFact[];
  readonly forms: readonly FormFact[];
  readonly metaRefresh: MetaRefreshFact | null;
  readonly additional: readonly ExtractedLink[];
}

export function collectLinks(
  input: LinkCollectionInput,
): readonly ExtractedLink[] {
  const links: ExtractedLink[] = [];
  for (const anchor of input.anchors)
    if (anchor.rawHref !== null)
      links.push(
        htmlExtractedLink(
          anchor.rawHref,
          "a[href]",
          "navigation",
          anchor.text,
          anchor.rel,
          anchor.target,
          "a",
          "href",
          anchor.position,
        ),
      );
  for (const area of input.areas)
    if (area.rawHref !== null)
      links.push(
        htmlExtractedLink(
          area.rawHref,
          "area[href]",
          "navigation",
          area.text,
          area.rel,
          area.target,
          "area",
          "href",
          area.position,
        ),
      );
  if (input.canonical !== null && input.canonical.rawHref !== null)
    links.push(
      linkFactExtracted(input.canonical, input.canonical.rawHref, "canonical"),
    );
  for (const link of input.alternates)
    if (link.rawHref !== null)
      links.push(linkFactExtracted(link, link.rawHref, "alternate"));
  for (const link of input.hreflang)
    if (link.rawHref !== null)
      links.push(linkFactExtracted(link, link.rawHref, "hreflang"));
  for (const link of input.stylesheets)
    if (link.rawHref !== null)
      links.push(linkFactExtracted(link, link.rawHref, "stylesheet"));
  for (const image of input.images) collectImage(image, links);
  for (const source of input.sources) collectSource(source, links);
  for (const iframe of input.iframes)
    if (iframe.rawSrc !== null)
      links.push(
        htmlExtractedLink(
          iframe.rawSrc,
          "iframe[src]",
          "iframe",
          null,
          [],
          null,
          "iframe",
          "src",
          iframe.position,
        ),
      );
  for (const script of input.scripts)
    if (script.rawSrc !== null)
      links.push(
        htmlExtractedLink(
          script.rawSrc,
          "script[src]",
          "script",
          null,
          [],
          null,
          "script",
          "src",
          script.position,
        ),
      );
  for (const form of input.forms)
    if (form.rawAction !== null)
      links.push(
        htmlExtractedLink(
          form.rawAction,
          "form[action]",
          "form",
          null,
          [],
          null,
          "form",
          "action",
          form.position,
        ),
      );
  if (input.metaRefresh?.rawUrl !== null && input.metaRefresh !== null)
    links.push({
      raw: input.metaRefresh.rawUrl,
      source: "meta-refresh",
      kind: "navigation",
      anchorText: null,
      rel: [],
      target: null,
      evidence: {
        kind: "html",
        method: "meta-refresh",
        element: "meta",
        attribute: "content",
        position: null,
      },
    });
  links.push(...input.additional);
  return links;
}

function collectImage(image: ImageFact, links: ExtractedLink[]): void {
  if (image.rawSrc !== null)
    links.push(
      htmlExtractedLink(
        image.rawSrc,
        "img[src]",
        "image",
        image.alt,
        [],
        null,
        "img",
        "src",
        image.position,
      ),
    );
  for (const src of image.srcset)
    links.push(
      htmlExtractedLink(
        src,
        "img[srcset]",
        "image",
        image.alt,
        [],
        null,
        "img",
        "srcset",
        image.position,
        "srcset",
      ),
    );
}

function collectSource(source: ElementNode, links: ExtractedLink[]): void {
  const position = spanToPosition(source.span ?? null);
  const src = getUnnamespacedAttribute(source, "src");
  if (src !== null)
    links.push(
      htmlExtractedLink(
        src,
        "source[src]",
        "asset",
        null,
        [],
        null,
        "source",
        "src",
        position,
      ),
    );
  for (const srcset of parseSrcset(getUnnamespacedAttribute(source, "srcset")))
    links.push(
      htmlExtractedLink(
        srcset,
        "source[srcset]",
        "asset",
        null,
        [],
        null,
        "source",
        "srcset",
        position,
        "srcset",
      ),
    );
}
