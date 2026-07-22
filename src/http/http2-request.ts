import type {
  ClientHttp2Session,
  IncomingHttpHeaders,
  IncomingHttpStatusHeader,
} from "node:http2";
import type { ResolvedCrawlConfig } from "../config/types.js";
import { createHttp2Headers } from "./http2-headers.js";
import { readHttp2Response, tlsFactsForHttp2 } from "./http2-response.js";
import { failure } from "./result-factory.js";
import type { FetchOptions, FetchResult } from "./types.js";

export function requestOnHttp2Session(
  session: ClientHttp2Session,
  url: URL,
  options: FetchOptions,
  signal: AbortSignal,
  requestStartedAt: number,
  dnsMs: number,
  connectMs: number,
  config: ResolvedCrawlConfig,
): Promise<FetchResult> {
  return new Promise((resolve) => {
    let settled = false;
    const stream = session.request(createHttp2Headers(config, url, options), {
      endStream: true,
      signal,
    });
    const finish = (result: FetchResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(firstByteTimer);
      resolve(result);
    };
    const firstByteTimer = setTimeout(() => {
      stream.close();
      finish(
        timedHttp2Failure(
          "FETCH_FIRST_BYTE_TIMEOUT",
          "Waiting for the first HTTP/2 response byte timed out",
          url.href,
          options,
          requestStartedAt,
          dnsMs,
          undefined,
          true,
        ),
      );
    }, config.network.firstByteTimeoutMs);
    const onResponse = (
      headers: IncomingHttpHeaders & IncomingHttpStatusHeader,
    ): void => {
      clearTimeout(firstByteTimer);
      const firstByteMs = performance.now() - requestStartedAt;
      readHttp2Response(stream, headers, url.href, options, signal, {
        requestStartedAt,
        dnsMs,
        connectMs,
        firstByteMs,
        remoteAddress: session.socket?.remoteAddress ?? null,
        tls:
          session.socket === undefined
            ? null
            : tlsFactsForHttp2(session.socket),
        limits: options.responseLimits ?? config.responseLimits,
      }).then(finish, (caught: unknown) => {
        finish(
          timedHttp2Failure(
            "FETCH_NETWORK_ERROR",
            "Failed while reading HTTP/2 response",
            url.href,
            options,
            requestStartedAt,
            dnsMs,
            caught,
            true,
          ),
        );
      });
    };
    stream.once("response", onResponse);
    stream.once("error", (caught: Error) => {
      const external = options.signal?.aborted === true;
      const timedOut = signal.aborted && !external;
      finish(
        timedHttp2Failure(
          external
            ? "FETCH_ABORTED"
            : timedOut
              ? "FETCH_TIMEOUT"
              : "FETCH_NETWORK_ERROR",
          external
            ? "HTTP/2 request was aborted"
            : timedOut
              ? "HTTP/2 request timed out"
              : "HTTP/2 stream failed",
          url.href,
          options,
          requestStartedAt,
          dnsMs,
          caught,
          !external,
        ),
      );
    });
  });
}

export function timedHttp2Failure(
  code: Parameters<typeof failure>[0],
  message: string,
  url: string,
  options: FetchOptions,
  startedAt: number,
  dnsMs: number,
  cause: unknown = undefined,
  retryable = true,
): FetchResult {
  const totalMs = performance.now() - startedAt;
  return {
    ...failure(
      code,
      message,
      url,
      options.requestId,
      null,
      new Headers(),
      cause,
      retryable,
    ),
    responseTimeMs: totalMs,
    timings: {
      dnsMs,
      connectMs: null,
      tlsMs: null,
      firstByteMs: null,
      bodyMs: null,
      totalMs,
    },
  };
}
