import type { ResolvedCrawlConfig } from "../config/types.js";
import { nowIso } from "../core/utils.js";
import { crawlError } from "../diagnostics/factory.js";
import type { CrawlEvent } from "../events/types.js";
import type { Frontier } from "../frontier/index.js";
import type { FetchResult, HttpClient } from "../http/index.js";
import { disposeResponseBody } from "../http/body.js";
import type { CrawlRequest } from "../requests/types.js";
import { abortableDelay } from "../runtime/abortable-delay.js";
import type { ResultStore } from "../storage/index.js";
import type { RedirectTargetPolicy } from "./redirect-target-policy.js";
import type { SeedResolver } from "./seed-resolver.js";
import type { CrawlCounters } from "./types.js";

export interface RetryingFetcherDependencies {
  readonly runId: string;
  readonly config: ResolvedCrawlConfig;
  readonly fetcher: HttpClient;
  readonly store: ResultStore;
  readonly frontier: Frontier;
  readonly seeds: SeedResolver;
  readonly redirects: RedirectTargetPolicy;
  readonly counters: CrawlCounters;
  emit(event: CrawlEvent): void;
}

export class RetryingFetcher {
  private readonly deps: RetryingFetcherDependencies;

  public constructor(deps: RetryingFetcherDependencies) {
    this.deps = deps;
  }

  public async fetch(
    request: CrawlRequest,
    signal: AbortSignal,
  ): Promise<FetchResult> {
    let attempt = 0;
    while (true) {
      const result = await this.deps.fetcher.fetch(request.normalizedUrl, {
        requestId: request.id,
        method: request.method,
        headers: request.headers,
        signal,
        onRedirectTarget: (targetUrl) =>
          this.deps.redirects.decide(
            targetUrl,
            request.depth,
            this.deps.seeds.forRequest(request)?.normalizedUrl ??
              request.normalizedUrl,
          ),
      });
      if (signal.aborted || result.error?.code === "FETCH_ABORTED") {
        return result;
      }
      const statusCode = result.statusCode ?? 0;
      const retryable =
        result.error?.retryable === true || isRetryableStatus(statusCode);
      if (!retryable || attempt >= request.maxRetries) return result;
      try {
        const delayMs = this.retryDelayMs(
          result.headers.get("retry-after"),
          attempt,
        );
        this.deps.counters.retries += 1;
        const error =
          result.error ??
          crawlError({
            code: "HTTP_ERROR",
            message: `HTTP ${statusCode} is retryable`,
            url: request.normalizedUrl,
            requestId: request.id,
            retryable: true,
            attempt,
          });
        await this.deps.store.writeError(error);
        await this.deps.store.writeRequestState(
          this.deps.frontier.stateRecord(request, "retrying", error.message),
        );
        this.deps.emit({
          type: "retry-scheduled",
          runId: this.deps.runId,
          requestId: request.id,
          attempt: attempt + 1,
          delayMs,
          createdAt: nowIso(),
        });
        await abortableDelay(delayMs, signal);
        attempt += 1;
      } finally {
        await disposeResponseBody(result.body);
      }
    }
  }

  private retryDelayMs(retryAfter: string | null, attempt: number): number {
    if (this.deps.config.network.respectRetryAfter && retryAfter !== null) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
      const date = Date.parse(retryAfter);
      if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    }
    return this.deps.config.network.retryBackoffMs * 2 ** attempt;
  }
}

function isRetryableStatus(statusCode: number): boolean {
  return (
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504
  );
}
