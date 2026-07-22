export { decompressXmlPayload } from "./compression.js";
export { extractXmlDocument } from "./document-extractor.js";
export { extractXmlResource } from "./extractor.js";
export { extractFeedEntries } from "./feed.js";
export { extractSitemapEntries } from "./sitemap.js";
export type {
  XmlExtractionInput,
  XmlResourceContext,
} from "./extraction-types.js";
export type {
  CrawledXmlResource,
  FeedEntry,
  SitemapEntry,
  XmlNamespaceFact,
} from "./types.js";
