import type { ResolvedCrawlConfig } from "../config/types.js";
import type { NetworkSafetyPolicy } from "../network/index.js";
import type { NetworkAddress } from "../network/types.js";
import { classifyTransportError } from "./errors.js";
import { Http2SessionPool } from "./http2-session-pool.js";
import { requestOnHttp2Session, timedHttp2Failure } from "./http2-request.js";
import type { FetchOptions, FetchResult } from "./types.js";

export class NodeHttp2Transport {
  private readonly config: ResolvedCrawlConfig;
  private readonly safety: NetworkSafetyPolicy;
  private readonly pool: Http2SessionPool;

  public constructor(config: ResolvedCrawlConfig, safety: NetworkSafetyPolicy) {
    this.config = config;
    this.safety = safety;
    this.pool = new Http2SessionPool(
      config.network.rejectUnauthorized,
      config.network.connectTimeoutMs,
    );
  }

  public async fetchSingle(
    url: string,
    options: FetchOptions,
  ): Promise<FetchResult> {
    const requestStartedAt = performance.now();
    const dnsStartedAt = performance.now();
    const resolution = await this.safety.resolve(url);
    const dnsMs = performance.now() - dnsStartedAt;
    if (!resolution.decision.allowed || resolution.addresses.length === 0) {
      return timedHttp2Failure(
        "NETWORK_SAFETY_REJECTED",
        resolution.decision.reason ?? "Network target rejected",
        url,
        options,
        requestStartedAt,
        dnsMs,
      );
    }
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return timedHttp2Failure(
        "FETCH_NETWORK_ERROR",
        "HTTP/2 transport requires HTTPS",
        url,
        options,
        requestStartedAt,
        dnsMs,
      );
    }
    let last: FetchResult | null = null;
    for (const address of resolution.addresses) {
      const result = await this.send(
        parsed,
        address,
        options,
        requestStartedAt,
        dnsMs,
      );
      last = result;
      if (result.error === null || options.signal?.aborted === true)
        return result;
    }
    return (
      last ??
      timedHttp2Failure(
        "FETCH_NETWORK_ERROR",
        "No approved HTTP/2 address could be reached",
        url,
        options,
        requestStartedAt,
        dnsMs,
      )
    );
  }

  public async close(): Promise<void> {
    await this.pool.close();
  }

  private async send(
    url: URL,
    address: NetworkAddress,
    options: FetchOptions,
    requestStartedAt: number,
    dnsMs: number,
  ): Promise<FetchResult> {
    const timeout = new AbortController();
    const signal =
      options.signal === undefined
        ? timeout.signal
        : AbortSignal.any([timeout.signal, options.signal]);
    const timer = setTimeout(
      () => timeout.abort(),
      this.config.network.requestTimeoutMs,
    );
    const connectStartedAt = performance.now();
    try {
      const session = await this.pool.session(url, address, signal);
      const connectMs = performance.now() - connectStartedAt;
      return await requestOnHttp2Session(
        session,
        url,
        options,
        signal,
        requestStartedAt,
        dnsMs,
        connectMs,
        this.config,
      );
    } catch (caught) {
      const external = options.signal?.aborted === true;
      const timedOut = timeout.signal.aborted && !external;
      const transportError =
        caught instanceof Error
          ? caught
          : new Error("Unknown HTTP/2 transport failure.");
      const classified = classifyTransportError(
        transportError,
        external,
        timedOut,
      );
      return timedHttp2Failure(
        classified.code,
        classified.message,
        url.href,
        options,
        requestStartedAt,
        dnsMs,
        caught,
        classified.retryable,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
