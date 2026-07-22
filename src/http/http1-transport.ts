import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import type { ResolvedCrawlConfig } from "../config/types.js";
import type { NetworkSafetyPolicy } from "../network/index.js";
import type { NetworkAddress } from "../network/types.js";
import {
  ConnectionObservation,
  withTransportTiming,
} from "./connection-observation.js";
import { classifyTransportError } from "./errors.js";
import { toWebHeaders } from "./headers.js";
import { Http1PhaseTimeouts } from "./http1-phase-timeouts.js";
import { readHttpResponse } from "./response-reader.js";
import { failure } from "./result-factory.js";
import {
  combineRequestSignals,
  shouldTryNextAddress,
} from "./http1-fallback.js";
import { createHttp1Request } from "./http1-request-factory.js";
import type { FetchOptions, FetchResult } from "./types.js";

export class NodeHttp1Transport {
  private readonly httpAgent = new http.Agent({ keepAlive: true });
  private readonly httpsAgent = new https.Agent({ keepAlive: true });
  private readonly config: ResolvedCrawlConfig;
  private readonly safety: NetworkSafetyPolicy;

  public constructor(config: ResolvedCrawlConfig, safety: NetworkSafetyPolicy) {
    this.config = config;
    this.safety = safety;
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
      return withTransportTiming(
        failure(
          "NETWORK_SAFETY_REJECTED",
          resolution.decision.reason ?? "Network target rejected",
          url,
          options.requestId,
          null,
          new Headers(),
        ),
        requestStartedAt,
        dnsMs,
      );
    }

    const timeout = new AbortController();
    const signal = combineRequestSignals(timeout.signal, options.signal);
    const timer = setTimeout(
      () => timeout.abort(),
      this.config.network.requestTimeoutMs,
    );
    try {
      let last: FetchResult | null = null;
      for (const address of resolution.addresses) {
        const result = await this.send(
          url,
          address,
          options,
          signal,
          timeout.signal,
          requestStartedAt,
          dnsMs,
        );
        last = result;
        if (!shouldTryNextAddress(result, signal)) return result;
      }
      return (
        last ??
        withTransportTiming(
          failure(
            "FETCH_NETWORK_ERROR",
            "No approved network address could be reached",
            url,
            options.requestId,
            null,
            new Headers(),
          ),
          requestStartedAt,
          dnsMs,
        )
      );
    } finally {
      clearTimeout(timer);
    }
  }

  public async close(): Promise<void> {
    const sockets = uniqueAgentSockets(this.httpAgent, this.httpsAgent);
    const closed = sockets.map(waitForSocketClose);
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
    await Promise.all(closed);
  }

  private async send(
    url: string,
    address: NetworkAddress,
    options: FetchOptions,
    signal: AbortSignal,
    timeoutSignal: AbortSignal,
    requestStartedAt: number,
    dnsMs: number,
  ): Promise<FetchResult> {
    const parsed = new URL(url);
    const connection = new ConnectionObservation(requestStartedAt, dnsMs);
    return await new Promise<FetchResult>((resolve) => {
      let phaseTimeouts: Http1PhaseTimeouts | null = null;
      const onResponse = (response: IncomingMessage): void => {
        phaseTimeouts?.markResponseStarted();
        connection.markFirstByte();
        readHttpResponse(
          response,
          url,
          options,
          signal,
          this.config,
          connection.context(response.socket),
        ).then(resolve, (caught: unknown) => {
          resolve(
            connection.failure(
              "FETCH_NETWORK_ERROR",
              "Failed while reading response",
              url,
              options.requestId,
              response.statusCode ?? null,
              toWebHeaders(response.headers),
              caught,
              true,
            ),
          );
        });
      };

      const request = this.createRequest(
        parsed,
        address,
        options,
        signal,
        onResponse,
      );
      phaseTimeouts = new Http1PhaseTimeouts(request, {
        connectTimeoutMs: this.config.network.connectTimeoutMs,
        firstByteTimeoutMs: this.config.network.firstByteTimeoutMs,
      });
      request.once("socket", (socket) => {
        connection.observe(socket);
        phaseTimeouts?.observe(socket);
      });
      request.once("error", (caught: Error) => {
        phaseTimeouts?.close();
        const externallyAborted = options.signal?.aborted === true;
        const timedOut = timeoutSignal.aborted && !externallyAborted;
        const classified = classifyTransportError(
          caught,
          externallyAborted,
          timedOut,
        );
        resolve(
          connection.failure(
            classified.code,
            classified.message,
            url,
            options.requestId,
            null,
            new Headers(),
            caught,
            classified.retryable,
          ),
        );
      });
      request.end();
    });
  }

  private createRequest(
    parsed: URL,
    address: NetworkAddress,
    options: FetchOptions,
    signal: AbortSignal,
    onResponse: (response: IncomingMessage) => void,
  ) {
    return createHttp1Request(
      parsed,
      address,
      options,
      signal,
      this.config,
      { http: this.httpAgent, https: this.httpsAgent },
      onResponse,
    );
  }
}

function uniqueAgentSockets(
  ...agents: readonly http.Agent[]
): readonly Socket[] {
  const sockets = new Set<Socket>();
  for (const agent of agents) {
    for (const group of Object.values(agent.sockets)) {
      if (group === undefined) continue;
      for (const socket of group) sockets.add(socket);
    }
    for (const group of Object.values(agent.freeSockets)) {
      if (group === undefined) continue;
      for (const socket of group) sockets.add(socket);
    }
  }
  return [...sockets];
}

function waitForSocketClose(socket: Socket): Promise<void> {
  if (socket.closed) return Promise.resolve();
  return new Promise((resolve) => {
    socket.once("close", resolve);
  });
}
