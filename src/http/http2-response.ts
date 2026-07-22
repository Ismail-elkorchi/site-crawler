import {
  constants,
  type ClientHttp2Stream,
  type IncomingHttpHeaders,
} from "node:http2";
import { TLSSocket } from "node:tls";
import { readBody } from "./body-reader.js";
import { parseContentLength } from "./content-length.js";
import { remapBodyAbort } from "./errors.js";
import { toWebHeaders } from "./headers.js";
import { isRedirectStatus } from "./redirect.js";
import { failure } from "./result-factory.js";
import type { NetworkTimings, TlsFacts } from "./timing-types.js";
import type { FetchOptions, FetchResult, ResponseLimits } from "./types.js";

export interface Http2ResponseContext {
  readonly requestStartedAt: number;
  readonly dnsMs: number;
  readonly connectMs: number;
  readonly firstByteMs: number;
  readonly remoteAddress: string | null;
  readonly tls: TlsFacts | null;
  readonly limits: ResponseLimits;
}

export async function readHttp2Response(
  stream: ClientHttp2Stream,
  rawHeaders: IncomingHttpHeaders,
  url: string,
  options: FetchOptions,
  signal: AbortSignal,
  context: Http2ResponseContext,
): Promise<FetchResult> {
  const headers = toWebHeaders(rawHeaders);
  const statusCode = statusFrom(rawHeaders);
  const contentLength = parseContentLength(headers.get("content-length"));
  if (
    contentLength !== null &&
    contentLength > context.limits.maxCompressedBytes
  ) {
    stream.close(constants.NGHTTP2_CANCEL);
    return contextual(
      failure(
        "RESPONSE_TOO_LARGE",
        "Response content-length exceeds configured wire-byte limit",
        url,
        options.requestId,
        statusCode,
        headers,
      ),
      context,
      null,
    );
  }
  if (statusCode !== null && isRedirectStatus(statusCode)) {
    stream.resume();
    return contextual(
      {
        ...baseResult(statusCode, url, headers, context),
        body: { kind: "memory", bytes: new Uint8Array(), size: 0 },
        wireBytesRead: 0,
        decodedBytesRead: 0,
      },
      context,
      0,
    );
  }
  const bodyStartedAt = performance.now();
  const body = await readBody(
    stream,
    encodingFrom(rawHeaders),
    context.limits,
    url,
    options.requestId,
    signal,
  );
  return contextual(
    {
      ...baseResult(statusCode, url, headers, context),
      body: body.body,
      wireBytesRead: body.wireBytesRead,
      decodedBytesRead: body.decodedBytesRead,
      error: remapBodyAbort(body.error, options.signal),
    },
    context,
    performance.now() - bodyStartedAt,
  );
}

export function tlsFactsForHttp2(
  socket: import("node:net").Socket,
): TlsFacts | null {
  if (!(socket instanceof TLSSocket)) return null;
  const certificate = socket.getPeerCertificate();
  const cipher = socket.getCipher();
  return {
    protocol: socket.getProtocol(),
    cipher: cipher?.name ?? null,
    authorized: socket.authorized,
    authorizationError:
      socket.authorizationError === undefined
        ? null
        : String(socket.authorizationError),
    certificateValidTo: certificate.valid_to ?? null,
  };
}

function baseResult(
  statusCode: number | null,
  url: string,
  headers: Headers,
  context: Http2ResponseContext,
): FetchResult {
  return {
    statusCode,
    finalUrl: url,
    headers,
    body: null,
    redirects: [],
    responseTimeMs: 0,
    wireBytesRead: null,
    decodedBytesRead: null,
    remoteAddress: context.remoteAddress,
    protocol: "h2",
    timings: timings(context, null),
    tls: context.tls,
    cacheStatus: "miss",
    error: null,
  };
}

function contextual(
  result: FetchResult,
  context: Http2ResponseContext,
  bodyMs: number | null,
): FetchResult {
  const networkTimings = timings(context, bodyMs);
  return {
    ...result,
    responseTimeMs: networkTimings.totalMs,
    timings: networkTimings,
  };
}

function timings(
  context: Http2ResponseContext,
  bodyMs: number | null,
): NetworkTimings {
  return {
    dnsMs: context.dnsMs,
    connectMs: context.connectMs,
    tlsMs: context.connectMs,
    firstByteMs: context.firstByteMs,
    bodyMs,
    totalMs: performance.now() - context.requestStartedAt,
  };
}

function statusFrom(headers: IncomingHttpHeaders): number | null {
  const value = headers[constants.HTTP2_HEADER_STATUS];
  return typeof value === "number" ? value : null;
}

function encodingFrom(
  headers: IncomingHttpHeaders,
): string | string[] | undefined {
  const value = headers["content-encoding"];
  if (typeof value === "string" || Array.isArray(value)) return value;
  return undefined;
}
