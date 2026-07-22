import type { ResolvedCrawlConfig } from "../config/types.js";
import type { NetworkSafetyPolicy } from "../network/index.js";
import { NodeHttp1Transport } from "./http1-transport.js";
import { NodeHttp2Transport } from "./http2-transport.js";
import type { FetchOptions, FetchResult } from "./types.js";

export class NodeHttpTransport {
  private readonly config: ResolvedCrawlConfig;
  private readonly http1: NodeHttp1Transport;
  private readonly http2: NodeHttp2Transport;

  public constructor(config: ResolvedCrawlConfig, safety: NetworkSafetyPolicy) {
    this.config = config;
    this.http1 = new NodeHttp1Transport(config, safety);
    this.http2 = new NodeHttp2Transport(config, safety);
  }

  public async fetchSingle(
    url: string,
    options: FetchOptions,
  ): Promise<FetchResult> {
    const parsed = new URL(url);
    const preference = this.config.network.protocolPreference;
    if (preference === "http1" || parsed.protocol !== "https:")
      return await this.http1.fetchSingle(url, options);
    const h2 = await this.http2.fetchSingle(url, options);
    if (preference === "http2" || h2.error === null) return h2;
    return await this.http1.fetchSingle(url, options);
  }

  public async close(): Promise<void> {
    await Promise.all([this.http1.close(), this.http2.close()]);
  }
}
