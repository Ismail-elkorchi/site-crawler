import type { IncomingMessage } from "node:http";
import type { ResolvedCrawlConfig } from "../config/types.js";
import { readBody } from "./body-reader.js";
import { parseContentLength } from "./content-length.js";
import { remapBodyAbort } from "./errors.js";
import { toWebHeaders } from "./headers.js";
import { isRedirectStatus } from "./redirect.js";
import { failure } from "./result-factory.js";
import type {
  NegotiatedProtocol,
  NetworkTimings,
  TlsFacts,
} from "./timing-types.js";
import type { FetchOptions, FetchResult } from "./types.js";

export interface ResponseReadContext {
  readonly requestStartedAt: number;
  readonly dnsMs: number | null;
  readonly connectMs: number | null;
  readonly tlsMs: number | null;
  readonly firstByteMs: number | null;
  readonly protocol: NegotiatedProtocol;
  readonly tls: TlsFacts | null;
}

export async function readHttpResponse(
  response: IncomingMessage,
  url: string,
  options: FetchOptions,
  signal: AbortSignal,
  config: ResolvedCrawlConfig,
  context: ResponseReadContext,
): Promise<FetchResult> {
  const headers = toWebHeaders(response.headers);
  const remoteAddress = response.socket?.remoteAddress ?? null;
  const limits = options.responseLimits ?? config.responseLimits;
  const statusCode = response.statusCode ?? null;
  const contentLength = parseContentLength(headers.get("content-length"));
  if (contentLength !== null && contentLength > limits.maxCompressedBytes) {
    response.destroy();
    return withContext(
      failure(
        "RESPONSE_TOO_LARGE",
        "Response content-length exceeds configured wire-byte limit",
        url,
        options.requestId,
        statusCode,
        headers,
      ),
      context,
      remoteAddress,
      null,
    );
  }

  if (statusCode !== null && isRedirectStatus(statusCode)) {
    response.resume();
    return emptyResult(statusCode, url, headers, remoteAddress, context);
  }

  const bodyStartedAt = performance.now();
  const body = await readBody(
    response,
    response.headers["content-encoding"],
    limits,
    url,
    options.requestId,
    signal,
  );
  const bodyMs = performance.now() - bodyStartedAt;
  return withContext(
    {
      statusCode,
      finalUrl: url,
      headers,
      body: body.body,
      redirects: [],
      responseTimeMs: 0,
      wireBytesRead: body.wireBytesRead,
      decodedBytesRead: body.decodedBytesRead,
      remoteAddress,
      protocol: context.protocol,
      timings: timingSnapshot(context, bodyMs),
      tls: context.tls,
      cacheStatus: "miss",
      error: remapBodyAbort(body.error, options.signal),
    },
    context,
    remoteAddress,
    bodyMs,
  );
}

function emptyResult(
  statusCode: number,
  finalUrl: string,
  headers: Headers,
  remoteAddress: string | null,
  context: ResponseReadContext,
): FetchResult {
  return withContext(
    {
      statusCode,
      finalUrl,
      headers,
      body: { kind: "memory", bytes: new Uint8Array(), size: 0 },
      redirects: [],
      responseTimeMs: 0,
      wireBytesRead: 0,
      decodedBytesRead: 0,
      remoteAddress,
      protocol: context.protocol,
      timings: timingSnapshot(context, 0),
      tls: context.tls,
      cacheStatus: "miss",
      error: null,
    },
    context,
    remoteAddress,
    0,
  );
}

function withContext(
  result: FetchResult,
  context: ResponseReadContext,
  remoteAddress: string | null,
  bodyMs: number | null,
): FetchResult {
  const timings = timingSnapshot(context, bodyMs);
  return {
    ...result,
    remoteAddress,
    protocol: context.protocol,
    timings,
    tls: context.tls,
    responseTimeMs: timings.totalMs,
  };
}

function timingSnapshot(
  context: ResponseReadContext,
  bodyMs: number | null,
): NetworkTimings {
  return {
    dnsMs: context.dnsMs,
    connectMs: context.connectMs,
    tlsMs: context.tlsMs,
    firstByteMs: context.firstByteMs,
    bodyMs,
    totalMs: performance.now() - context.requestStartedAt,
  };
}
