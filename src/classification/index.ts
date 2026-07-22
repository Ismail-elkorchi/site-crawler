import type { ResourceType } from "../resources/types.js";
export interface ClassificationInput {
  readonly url: string;
  readonly statusCode: number | null;
  readonly contentType: string | null;
  readonly bodyStart: Uint8Array;
}
export function classifyResponse(input: ClassificationInput): ResourceType {
  if (input.statusCode === null) return "error";
  if (
    input.statusCode === 204 ||
    input.statusCode === 205 ||
    input.bodyStart.byteLength === 0
  )
    return "empty";
  const contentType =
    input.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const lowerUrl = input.url.toLowerCase();
  if (isCompressedSitemap(lowerUrl)) return "sitemap";
  if (contentType.includes("html")) return "html";
  if (contentType.includes("rss") || contentType.includes("atom"))
    return "feed";
  if (contentType.includes("xml")) return classifyXmlByUrl(lowerUrl);
  if (contentType === "application/json" || contentType.endsWith("+json"))
    return "json";
  if (contentType.startsWith("text/plain"))
    return sniffText(input.bodyStart, lowerUrl);
  if (contentType.startsWith("text/css")) return "css";
  if (contentType.includes("javascript")) return "javascript";
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("font/") || contentType.includes("woff"))
    return "font";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (
    contentType.includes("zip") ||
    contentType.includes("tar") ||
    contentType.includes("gzip")
  )
    return "archive";
  return classifyByExtension(lowerUrl, input.bodyStart);
}
function isCompressedSitemap(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase();
  return (
    pathname.endsWith(".xml.gz") ||
    (pathname.endsWith(".gz") && pathname.includes("sitemap"))
  );
}
function classifyXmlByUrl(url: string): ResourceType {
  if (url.includes("sitemap")) return "sitemap";
  if (url.includes("feed") || url.endsWith(".rss") || url.endsWith(".atom"))
    return "feed";
  return "xml";
}
function sniffText(bytes: Uint8Array, lowerUrl: string): ResourceType {
  const start = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 256))
    .trimStart()
    .toLowerCase();
  if (start.startsWith("<!doctype html") || start.startsWith("<html"))
    return "html";
  if (
    start.startsWith("<?xml") ||
    start.startsWith("<urlset") ||
    start.startsWith("<sitemapindex")
  )
    return classifyXmlByUrl(lowerUrl);
  return "text";
}
function classifyByExtension(
  lowerUrl: string,
  bytes: Uint8Array,
): ResourceType {
  const path = new URL(lowerUrl).pathname;
  if (path.endsWith(".html") || path.endsWith(".htm")) return "html";
  if (path.endsWith(".xml")) return classifyXmlByUrl(lowerUrl);
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "javascript";
  if (path.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/u.test(path)) return "image";
  if (/\.(woff2?|ttf|otf|eot)$/u.test(path)) return "font";
  if (/\.(mp4|webm|mov)$/u.test(path)) return "video";
  if (/\.(mp3|wav|ogg)$/u.test(path)) return "audio";
  if (/\.(zip|gz|tar|tgz|7z)$/u.test(path)) return "archive";
  return sniffText(bytes, lowerUrl) === "text"
    ? "unknown"
    : sniffText(bytes, lowerUrl);
}
export function isHtmlLike(type: ResourceType): boolean {
  return type === "html";
}
export function isXmlLike(type: ResourceType): boolean {
  return (
    type === "xml" ||
    type === "sitemap" ||
    type === "sitemap-index" ||
    type === "feed"
  );
}
export function shouldEnqueueNavigationUrl(url: string): boolean {
  const pathname = new URL(url).pathname.toLowerCase();
  return !/\.(css|js|mjs|png|jpe?g|gif|webp|avif|svg|pdf|zip|gz|tar|tgz|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|ogg)$/u.test(
    pathname,
  );
}
