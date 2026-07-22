import type { XmlElementNode } from "@ismail-elkorchi/xml-parser";
import { nowIso } from "../core/utils.js";
import { normalizeUrl } from "../url/index.js";
import { attr, childText, elementChildren } from "./xml-dom.js";
import type { XmlResourceContext } from "./extraction-types.js";
import type { FeedEntry } from "./types.js";
import { ATOM_NAMESPACE } from "./xml-classifier.js";
export function extractFeedEntries(
  input: XmlResourceContext,
  root: XmlElementNode,
): readonly FeedEntry[] {
  const atom =
    root.localName === "feed" && root.namespaceURI === ATOM_NAMESPACE;
  const candidates = atom
    ? elementChildren(root, "entry", ATOM_NAMESPACE)
    : elementChildren(root, "channel", null).flatMap((channel) =>
        elementChildren(channel, "item", null),
      );
  return candidates.map((entry) => feedEntry(input, entry, atom));
}
function feedEntry(
  input: XmlResourceContext,
  entry: XmlElementNode,
  atom: boolean,
): FeedEntry {
  const rawUrl = atom ? atomEntryUrl(entry) : childText(entry, "link", null);
  const normalized =
    rawUrl === null ? null : normalizeUrl(rawUrl, input.finalUrl);
  return {
    schemaId: "site-crawler.feedEntry",
    schemaVersion: 1,
    runId: input.runId,
    feedUrl: input.finalUrl,
    rawUrl,
    resolvedUrl: normalized?.ok === true ? normalized.value.resolvedUrl : null,
    normalizedUrl:
      normalized?.ok === true ? normalized.value.normalizedUrl : null,
    title: childText(entry, "title", atom ? ATOM_NAMESPACE : null),
    publishedAt: atom
      ? childText(entry, "published", ATOM_NAMESPACE)
      : childText(entry, "pubDate", null),
    updatedAt: atom ? childText(entry, "updated", ATOM_NAMESPACE) : null,
    discoveredAt: nowIso(),
  };
}
function atomEntryUrl(entry: XmlElementNode): string | null {
  for (const link of elementChildren(entry, "link", ATOM_NAMESPACE)) {
    const rel = attr(link, "rel", null) ?? "alternate";
    const href = attr(link, "href", null);
    if (href !== null && rel === "alternate") return href;
  }
  return null;
}
