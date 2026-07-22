import dns from "node:dns/promises";
import net from "node:net";
import { decideIp } from "./ip-policy.js";
import type {
  NetworkAddress,
  NetworkResolution,
  NetworkResolver,
  NetworkSafetyConfig,
  NetworkSafetyDecision,
} from "./types.js";

export class NetworkSafetyPolicy {
  private readonly config: NetworkSafetyConfig;
  private readonly resolver: NetworkResolver;
  private readonly cache = new Map<string, CachedResolution>();

  public constructor(
    config: NetworkSafetyConfig,
    resolver: NetworkResolver = defaultResolver,
  ) {
    this.config = config;
    this.resolver = resolver;
  }

  public async decide(url: string): Promise<NetworkSafetyDecision> {
    return (await this.resolve(url)).decision;
  }

  public async resolve(url: string): Promise<NetworkResolution> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return rejected("Invalid URL", null, null, [], []);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return rejected(
        `Unsupported protocol: ${parsed.protocol}`,
        null,
        parsed.hostname,
        [],
        [],
      );
    }
    const hostname = normalizedHostname(parsed.hostname);
    const cached = this.cache.get(hostname);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return cached.resolution;
    }
    const resolution = await this.lookup(hostname);
    this.cache.set(hostname, {
      resolution,
      expiresAt: Date.now() + this.config.dnsCacheTtlMs,
    });
    return resolution;
  }

  private async lookup(hostname: string): Promise<NetworkResolution> {
    const literalFamily = net.isIP(hostname);
    if (literalFamily !== 0) {
      return evaluateNetworkAddresses(
        hostname,
        [{ address: hostname, family: literalFamily === 4 ? 4 : 6 }],
        this.config,
      );
    }
    try {
      const addresses = await withTimeout(
        this.resolver(hostname),
        this.config.dnsTimeoutMs,
      );
      if (addresses.length === 0) {
        return rejected(
          "DNS lookup returned no addresses",
          null,
          hostname,
          [],
          [],
        );
      }
      return evaluateNetworkAddresses(hostname, addresses, this.config);
    } catch {
      return rejected("DNS lookup failed", null, hostname, [], []);
    }
  }
}

interface CachedResolution {
  readonly resolution: NetworkResolution;
  readonly expiresAt: number;
}

export function evaluateNetworkAddresses(
  hostname: string,
  addresses: readonly NetworkAddress[],
  config: NetworkSafetyConfig,
): NetworkResolution {
  if (!config.enabled) {
    return {
      decision: allow(addresses[0]?.address ?? null),
      hostname,
      addresses,
      rejectedAddresses: [],
    };
  }
  const approved: NetworkAddress[] = [];
  const rejectedAddresses: NetworkAddress[] = [];
  for (const address of addresses) {
    if (decideIp(address.address, config).allowed) approved.push(address);
    else rejectedAddresses.push(address);
  }
  if (
    config.mixedAddressPolicy === "reject-host" &&
    rejectedAddresses.length > 0
  ) {
    return rejected(
      "Hostname resolved to a blocked network address",
      rejectedAddresses[0]?.address ?? null,
      hostname,
      approved,
      rejectedAddresses,
    );
  }
  if (approved.length === 0) {
    return rejected(
      "Hostname has no approved network addresses",
      rejectedAddresses[0]?.address ?? null,
      hostname,
      [],
      rejectedAddresses,
    );
  }
  return {
    decision: allow(approved[0]?.address ?? null),
    hostname,
    addresses: approved,
    rejectedAddresses,
  };
}

function rejected(
  reason: string,
  ip: string | null,
  hostname: string | null,
  addresses: readonly NetworkAddress[],
  rejectedAddresses: readonly NetworkAddress[],
): NetworkResolution {
  return {
    decision: { allowed: false, reason, checkedIp: ip },
    hostname,
    addresses,
    rejectedAddresses,
  };
}

function allow(ip: string | null): NetworkSafetyDecision {
  return { allowed: true, reason: null, checkedIp: ip };
}

function normalizedHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

async function defaultResolver(
  hostname: string,
): Promise<readonly NetworkAddress[]> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((record): NetworkAddress => ({
    address: record.address,
    family: record.family === 6 ? 6 : 4,
  }));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("DNS lookup timed out")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export type * from "./types.js";
