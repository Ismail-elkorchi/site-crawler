import type { XmlElementNode } from "@ismail-elkorchi/xml-parser";
import type { CrawledXmlResource } from "./types.js";
export const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";
export const ATOM_NAMESPACE = "http://www.w3.org/2005/Atom";
export function classifyXmlRoot(
  root: XmlElementNode,
): CrawledXmlResource["xmlKind"] {
  if (
    root.localName === "sitemapindex" &&
    root.namespaceURI === SITEMAP_NAMESPACE
  )
    return "sitemap-index";
  if (root.localName === "urlset" && root.namespaceURI === SITEMAP_NAMESPACE)
    return "sitemap";
  if (
    (root.localName === "rss" && root.namespaceURI === null) ||
    (root.localName === "feed" && root.namespaceURI === ATOM_NAMESPACE)
  )
    return "feed";
  return "generic-xml";
}
