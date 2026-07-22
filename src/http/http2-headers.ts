import { constants, type OutgoingHttpHeaders } from "node:http2";
import type { ResolvedCrawlConfig } from "../config/types.js";
import type { FetchOptions } from "./types.js";
import { createRequestHeaders } from "./headers.js";

export function createHttp2Headers(
  config: ResolvedCrawlConfig,
  url: URL,
  options: FetchOptions,
): OutgoingHttpHeaders {
  const common = createRequestHeaders(config, url, options.headers);
  const headers: OutgoingHttpHeaders = {
    [constants.HTTP2_HEADER_METHOD]: options.method,
    [constants.HTTP2_HEADER_SCHEME]: url.protocol.slice(0, -1),
    [constants.HTTP2_HEADER_AUTHORITY]: url.host,
    [constants.HTTP2_HEADER_PATH]: `${url.pathname}${url.search}`,
  };
  for (const [name, value] of Object.entries(common)) {
    const lower = name.toLowerCase();
    if (isForbidden(lower)) continue;
    headers[lower] = value;
  }
  return headers;
}

function isForbidden(name: string): boolean {
  return (
    name === "connection" ||
    name === "host" ||
    name === "keep-alive" ||
    name === "proxy-connection" ||
    name === "transfer-encoding" ||
    name === "upgrade"
  );
}
