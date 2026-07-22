import type { ResolvedCrawlConfig } from "../config/types.js";
import type { NetworkSafetyPolicy } from "../network/index.js";
import type { RedirectHop } from "../resources/types.js";
import { disposeResponseBody } from "./body.js";
import { HttpCache } from "./cache/index.js";
import { createRedirectHop } from "./redirect-record.js";
import { isRedirectStatus, resolveRedirectTarget } from "./redirect.js";
import { failure, withDuration } from "./result-factory.js";
import { SessionManager } from "./session/index.js";
import { NodeHttpTransport } from "./transport.js";
import type { FetchOptions, FetchResult, HttpClient } from "./types.js";

export class HttpFetcher implements HttpClient {
  private readonly config: ResolvedCrawlConfig;
  private readonly transport: NodeHttpTransport;
  private readonly session: SessionManager;
  private readonly cache: HttpCache;

  public constructor(
    config: ResolvedCrawlConfig,
    safety: NetworkSafetyPolicy,
    session: SessionManager = new SessionManager(config.session),
    cache: HttpCache = new HttpCache(config.httpCache),
  ) {
    this.config = config;
    this.transport = new NodeHttpTransport(config, safety);
    this.session = session;
    this.cache = cache;
  }

  public async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    const startedAt = performance.now();
    const redirects: RedirectHop[] = [];
    const visited = new Set<string>([url]);
    let currentUrl = url;

    for (
      let hopIndex = 0;
      hopIndex <= (options.maxRedirects ?? this.config.network.maxRedirects);
      hopIndex += 1
    ) {
      const cached = await this.cache.prepare(currentUrl, options.headers);
      const headers = await this.session.requestHeaders(
        currentUrl,
        cached.headers,
      );
      const fetched = await this.transport.fetchSingle(currentUrl, {
        ...options,
        headers,
      });
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

        const isLoop = visited.has(target.url);
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

        visited.add(target.url);
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
