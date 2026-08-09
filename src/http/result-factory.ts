import { crawlError } from "../diagnostics/factory.js";
import type { CrawlError } from "../diagnostics/types.js";
import type { FetchResult } from "./types.js";

export function failure(
  code: CrawlError["code"],
  message: string,
  url: string,
  requestId: string,
  statusCode: number | null,
  headers: Headers,
  cause?: unknown,
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
    protocol: null,
    timings: null,
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
    timings:
      result.timings === null ? null : { ...result.timings, totalMs: duration },
  };
}
