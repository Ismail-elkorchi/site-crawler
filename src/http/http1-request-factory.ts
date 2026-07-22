import http, {
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";
import https from "node:https";
import type { ResolvedCrawlConfig } from "../config/types.js";
import type { NetworkAddress } from "../network/types.js";
import { createRequestHeaders } from "./headers.js";
import type { FetchOptions } from "./types.js";

export interface Http1Agents {
  readonly http: http.Agent;
  readonly https: https.Agent;
}

export function createHttp1Request(
  parsed: URL,
  address: NetworkAddress,
  options: FetchOptions,
  signal: AbortSignal,
  config: ResolvedCrawlConfig,
  agents: Http1Agents,
  onResponse: (response: IncomingMessage) => void,
): ClientRequest {
  const common = requestOptions(parsed, address, options, signal, config);
  if (parsed.protocol === "https:") {
    return https.request(
      {
        ...common,
        agent: agents.https,
        servername: parsed.hostname,
        rejectUnauthorized: config.network.rejectUnauthorized,
      },
      onResponse,
    );
  }
  return http.request({ ...common, agent: agents.http }, onResponse);
}

function requestOptions(
  parsed: URL,
  address: NetworkAddress,
  options: FetchOptions,
  signal: AbortSignal,
  config: ResolvedCrawlConfig,
): RequestOptions {
  return {
    protocol: parsed.protocol,
    hostname: address.address,
    family: address.family,
    ...(parsed.port === "" ? {} : { port: Number(parsed.port) }),
    method: options.method,
    path: `${parsed.pathname}${parsed.search}`,
    headers: createRequestHeaders(config, parsed, options.headers),
    signal,
  };
}
