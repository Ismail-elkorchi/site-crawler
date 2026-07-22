import { crawlError } from "../diagnostics/factory.js";
import type { CrawlError } from "../diagnostics/types.js";
import type { FetchResult } from "./types.js";

const emptyTimings = {
  dnsMs: null,
  connectMs: null,
  tlsMs: null,
  firstByteMs: null,
  bodyMs: null,
  totalMs: 0,
} as const;

export function failure(
  code: CrawlError["code"],
  message: string,
  url: string,
  requestId: string,
  statusCode: number | null,
  headers: Headers,
  cause: unknown = undefined,
  retryable = false,
): FetchResult {
  return {
    statusCode,
    finalUrl: null,
    headers,
    body: null,
    redirects: [],
    responseTimeMs: 0,
    wireBytesRead: null,
    decodedBytesRead: null,
    remoteAddress: null,
    protocol: "unknown",
    timings: emptyTimings,
    tls: null,
    cacheStatus: "miss",
    error: crawlError({ code, message, url, requestId, cause, retryable }),
  };
}

export function withDuration(
  result: FetchResult,
  started: number,
): FetchResult {
  const duration = performance.now() - started;
  return {
    ...result,
    responseTimeMs: duration,
    timings: { ...result.timings, totalMs: duration },
  };
}
