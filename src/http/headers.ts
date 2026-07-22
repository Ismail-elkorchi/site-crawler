import type { IncomingHttpHeaders } from "node:http";
import type { ResolvedCrawlConfig } from "../config/types.js";

const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.8,application/javascript;q=0.7,*/*;q=0.5";

export function createRequestHeaders(
  config: ResolvedCrawlConfig,
  url: URL,
  overrides: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return {
    ...config.network.headers,
    ...overrides,
    host: url.host,
    "user-agent": config.robots.userAgent,
    accept: DEFAULT_ACCEPT,
    "accept-encoding": "gzip, deflate, br",
  };
}

export function toWebHeaders(input: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(input)) {
    if (name.startsWith(":")) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
      continue;
    }
    if (value !== undefined) headers.set(name, value);
  }
  return headers;
}
