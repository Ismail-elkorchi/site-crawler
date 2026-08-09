import {
  disposeResponseBody,
  HttpFields,
  mergeHttpFields,
  NodeHttpClient,
  requestAfterRedirect,
  type BufferedHttpResult,
  type HttpErrorCode,
  type HttpFieldsInput,
  type HttpAttemptTransfer,
} from "@ismail-elkorchi/http-client";
import type { ResolvedCrawlConfig } from "../config/types.js";
import { crawlError } from "../diagnostics/factory.js";
import type { CrawlErrorCode } from "../diagnostics/types.js";
import type { RedirectHop } from "../resources/types.js";
import { HttpCache } from "./cache/index.js";
import { createRedirectHop } from "./redirect-record.js";
import { isRedirectStatus, resolveRedirectTarget } from "./redirect.js";
import { failure, withDuration } from "./result-factory.js";
import { SessionManager } from "./session/index.js";
import type {
  FetchOptions,
  FetchResult,
  HttpClient,
  ResponseLimits,
} from "./types.js";

const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.8,application/javascript;q=0.7,*/*;q=0.5";

const CRAWLER_ERROR_CODES: Readonly<Record<HttpErrorCode, CrawlErrorCode>> = {
  INVALID_URL: "URL_PARSE_ERROR",
  UNSUPPORTED_PROTOCOL: "UNSUPPORTED_PROTOCOL",
  NETWORK_SAFETY_REJECTED: "NETWORK_SAFETY_REJECTED",
  DNS_ERROR: "DNS_ERROR",
  TLS_ERROR: "TLS_ERROR",
  TOTAL_TIMEOUT: "FETCH_TIMEOUT",
  CONNECT_TIMEOUT: "FETCH_CONNECT_TIMEOUT",
  RESPONSE_FIELDS_TIMEOUT: "FETCH_FIRST_BYTE_TIMEOUT",
  RESPONSE_BODY_TIMEOUT: "FETCH_TIMEOUT",
  REQUEST_ABORTED: "FETCH_ABORTED",
  NETWORK_FAILURE: "FETCH_NETWORK_ERROR",
  RESPONSE_DECOMPRESSION_FAILURE: "FETCH_DECOMPRESSION_ERROR",
  UNSUPPORTED_CONTENT_ENCODING: "UNSUPPORTED_CONTENT_ENCODING",
  REQUEST_BODY_TOO_LARGE: "CONFIG_ERROR",
  REQUEST_BODY_LENGTH_MISMATCH: "CONFIG_ERROR",
  REQUEST_BODY_SOURCE_FAILURE: "CONFIG_ERROR",
  REQUEST_FIELDS_TOO_LARGE: "CONFIG_ERROR",
  RESPONSE_FIELDS_TOO_LARGE: "RESPONSE_TOO_LARGE",
  TOO_MANY_REDIRECTS: "TOO_MANY_REDIRECTS",
  REDIRECT_LOOP: "REDIRECT_LOOP",
  REDIRECT_TARGET_REJECTED: "REDIRECT_TARGET_REJECTED",
  WIRE_RESPONSE_TOO_LARGE: "RESPONSE_TOO_LARGE",
  DECODED_RESPONSE_TOO_LARGE: "DECOMPRESSED_RESPONSE_TOO_LARGE",
  PROTOCOL_MISMATCH: "FETCH_NETWORK_ERROR",
  ORIGIN_CAPACITY_EXCEEDED: "FETCH_NETWORK_ERROR",
  FILESYSTEM_FAILURE: "STORAGE_WRITE_ERROR",
};

export class HttpFetcher implements HttpClient {
  private readonly config: ResolvedCrawlConfig;
  private readonly transport: NodeHttpClient;
  private readonly session: SessionManager;
  private readonly cache: HttpCache;

  public constructor(
    config: ResolvedCrawlConfig,
    session: SessionManager = new SessionManager(config.session),
    cache: HttpCache = new HttpCache(config.httpCache),
  ) {
    this.config = config;
    this.transport = new NodeHttpClient({
      timeouts: {
        totalMs: null,
        connectMs: config.network.connectTimeoutMs,
        responseFieldsMs: config.network.firstByteTimeoutMs,
      },
      maxRedirects: 0,
      protocolPreference: config.network.protocolPreference,
      tls: { rejectUnauthorized: config.network.rejectUnauthorized },
      maxConnectionsPerOrigin: config.network.maxConcurrencyPerOrigin,
      defaultFields: fieldsInput({
        "user-agent": config.robots.userAgent,
        accept: DEFAULT_ACCEPT,
        "accept-encoding": "gzip, deflate, br",
      }),
      responseTransferLimits: transferLimits(config.responseLimits),
      responseStorage: storageOptions(config.responseLimits),
      networkSafety: config.networkSafety,
    });
    this.session = session;
    this.cache = cache;
  }

  public async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    const startedAt = performance.now();
    const redirects: RedirectHop[] = [];
    const visited = new Set<string>([redirectIdentity(url)]);
    let currentUrl = url;
    let requestHeaders = mergeHeaderRecords(
      this.config.network.headers,
      options.headers,
    );
    const timeoutSignal = AbortSignal.timeout(
      this.config.network.requestTimeoutMs,
    );
    const signal =
      options.signal === undefined
        ? timeoutSignal
        : AbortSignal.any([options.signal, timeoutSignal]);

    for (
      let hopIndex = 0;
      hopIndex <= (options.maxRedirects ?? this.config.network.maxRedirects);
      hopIndex += 1
    ) {
      const cached = await this.cache.prepare(currentUrl, requestHeaders);
      const headers = await this.session.requestHeaders(
        currentUrl,
        cached.headers,
      );
      const limits = options.responseLimits ?? this.config.responseLimits;
      const sharedResult = await this.transport.requestBuffered(currentUrl, {
        method: options.method,
        fields: fieldsInput(headers),
        signal,
        responseTransferLimits: transferLimits(limits),
        responseStorage: storageOptions(limits),
      });
      const fetched = fromSharedResult(
        sharedResult,
        options.requestId,
        timeoutSignal.aborted && options.signal?.aborted !== true,
      );
      let result = fetched;
      let transferResultBody = false;
      try {
        await this.session.capture(currentUrl, fetched.headers);
        result = await this.cache.apply(currentUrl, fetched, cached.cached);
        if (result.error !== null) {
          transferResultBody = true;
          return withDuration({ ...result, redirects }, startedAt);
        }

        const statusCode = result.statusCode;
        if (statusCode === null || !isRedirectStatus(statusCode)) {
          transferResultBody = true;
          return withDuration({ ...result, redirects }, startedAt);
        }

        const location = result.headers.get("location");
        if (location === null) {
          transferResultBody = true;
          return withDuration({ ...result, redirects }, startedAt);
        }

        const target = resolveTarget(location, currentUrl, options, statusCode);
        if (!target.ok) return withDuration(target.result, startedAt);

        const targetIdentity = redirectIdentity(target.url);
        const isLoop = visited.has(targetIdentity);
        const decision = isLoop
          ? null
          : await options.onRedirectTarget(target.url);
        redirects.push(
          createRedirectHop(
            currentUrl,
            target.url,
            statusCode,
            hopIndex,
            !isLoop,
            decision,
          ),
        );

        if (isLoop) {
          return withDuration(
            redirectFailure(
              "REDIRECT_LOOP",
              "Redirect loop detected",
              target.url,
              options,
              statusCode,
              result.headers,
              redirects,
            ),
            startedAt,
          );
        }
        if (decision?.allowed !== true) {
          return withDuration(
            redirectFailure(
              "REDIRECT_TARGET_REJECTED",
              decision?.reason ?? "Redirect target rejected",
              target.url,
              options,
              statusCode,
              result.headers,
              redirects,
            ),
            startedAt,
          );
        }

        requestHeaders = fieldsRecord(
          requestAfterRedirect(currentUrl, target.url, statusCode, {
            method: options.method,
            fields: new HttpFields(fieldsInput(requestHeaders)),
            body: undefined,
          }).fields,
        );
        visited.add(targetIdentity);
        currentUrl = target.url;
      } finally {
        await disposeUntransferredBodies(
          fetched.body,
          result.body,
          transferResultBody,
        );
      }
    }

    return withDuration(
      redirectFailure(
        "TOO_MANY_REDIRECTS",
        "Redirect limit exceeded",
        currentUrl,
        options,
        null,
        new Headers(),
        redirects,
      ),
      startedAt,
    );
  }

  public async close(): Promise<void> {
    await this.transport.close();
  }

  public sessionManager(): SessionManager {
    return this.session;
  }
}

function fromSharedResult(
  result: BufferedHttpResult,
  requestId: string,
  operationTimedOut: boolean,
): FetchResult {
  const transfer = observedTransfer(result);
  const connection = result.connection;
  const errorCode =
    result.kind === "failure" &&
    result.error.code === "REQUEST_ABORTED" &&
    operationTimedOut
      ? "TOTAL_TIMEOUT"
      : result.kind === "failure"
        ? result.error.code
        : null;
  return {
    statusCode: result.statusCode,
    finalUrl: result.kind === "response" ? result.finalUrl : null,
    headers: result.fields.toHeaders(),
    body: result.kind === "response" ? result.body : null,
    redirects: [],
    responseTimeMs: transfer?.timings.totalMs ?? 0,
    wireBytesRead: transfer?.wireBytesReceived ?? null,
    decodedBytesRead: transfer?.decodedBytesReceived ?? null,
    remoteAddress: connection?.socketRemoteAddress ?? null,
    protocol: connection?.httpVersion ?? null,
    timings: transfer?.timings ?? null,
    tls: connection?.tls ?? null,
    cacheStatus: "miss",
    error:
      result.kind === "response"
        ? null
        : crawlError({
            code: crawlerErrorCode(errorCode ?? result.error.code),
            message: result.error.message,
            url: result.error.url,
            requestId,
            cause: result.error.cause,
            retryable: isRetryableError(errorCode ?? result.error.code),
          }),
  };
}

function observedTransfer(
  result: BufferedHttpResult,
): HttpAttemptTransfer | null {
  return result.attempts.at(-1)?.transfer ?? null;
}

function crawlerErrorCode(code: HttpErrorCode): CrawlErrorCode {
  return CRAWLER_ERROR_CODES[code];
}

function isRetryableError(code: HttpErrorCode): boolean {
  return (
    code === "DNS_ERROR" ||
    code === "TOTAL_TIMEOUT" ||
    code === "CONNECT_TIMEOUT" ||
    code === "RESPONSE_FIELDS_TIMEOUT" ||
    code === "RESPONSE_BODY_TIMEOUT" ||
    code === "NETWORK_FAILURE" ||
    code === "ORIGIN_CAPACITY_EXCEEDED"
  );
}

function fieldsInput(
  fields: Readonly<Record<string, string>>,
): HttpFieldsInput {
  return Object.entries(fields).map(([name, value]) => ({ name, value }));
}

function mergeHeaderRecords(
  ...records: readonly Readonly<Record<string, string>>[]
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    mergeHttpFields(...records.map(fieldsInput))
      .lines()
      .map(({ name, value }) => [name, value]),
  );
}

function fieldsRecord(fields: HttpFields): Readonly<Record<string, string>> {
  return Object.fromEntries(
    fields.lines().map(({ name, value }) => [name, value]),
  );
}

function transferLimits(limits: ResponseLimits): {
  readonly maxWireBytes: number;
  readonly maxDecodedBytes: number;
  readonly maxContentEncodingLayers: number;
} {
  return {
    maxWireBytes: limits.maxWireBytes,
    maxDecodedBytes: limits.maxDecodedBytes,
    maxContentEncodingLayers: limits.maxContentEncodingLayers,
  };
}

function storageOptions(limits: ResponseLimits): {
  readonly memoryThresholdBytes: number;
  readonly spoolDirectory: string | null;
} {
  return {
    memoryThresholdBytes: limits.memoryThresholdBytes,
    spoolDirectory: limits.spoolDirectory,
  };
}

async function disposeUntransferredBodies(
  fetched: FetchResult["body"],
  result: FetchResult["body"],
  transferResult: boolean,
): Promise<void> {
  if (fetched !== result) await disposeResponseBody(fetched);
  if (!transferResult) await disposeResponseBody(result);
}

interface ResolvedRedirectTarget {
  readonly ok: true;
  readonly url: string;
}

interface InvalidRedirectTarget {
  readonly ok: false;
  readonly result: FetchResult;
}

function resolveTarget(
  location: string,
  currentUrl: string,
  options: FetchOptions,
  statusCode: number,
): ResolvedRedirectTarget | InvalidRedirectTarget {
  try {
    return { ok: true, url: resolveRedirectTarget(location, currentUrl) };
  } catch (caught) {
    return {
      ok: false,
      result: failure(
        "REDIRECT_TARGET_REJECTED",
        "Invalid redirect target",
        currentUrl,
        options.requestId,
        statusCode,
        new Headers(),
        caught,
      ),
    };
  }
}

function redirectIdentity(url: string): string {
  const identity = new URL(url);
  identity.hash = "";
  return identity.href;
}

function redirectFailure(
  code: "REDIRECT_LOOP" | "REDIRECT_TARGET_REJECTED" | "TOO_MANY_REDIRECTS",
  message: string,
  url: string,
  options: FetchOptions,
  statusCode: number | null,
  headers: Headers,
  redirects: readonly RedirectHop[],
): FetchResult {
  return {
    ...failure(code, message, url, options.requestId, statusCode, headers),
    redirects,
  };
}
