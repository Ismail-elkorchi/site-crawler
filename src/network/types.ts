export type MixedAddressPolicy = "reject-host" | "use-safe-addresses-only";

export interface NetworkSafetyConfig {
  readonly enabled: boolean;
  readonly allowPrivateNetworks: boolean;
  readonly allowLocalhost: boolean;
  readonly mixedAddressPolicy: MixedAddressPolicy;
  readonly dnsTimeoutMs: number;
  readonly dnsCacheTtlMs: number;
}

export interface NetworkAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export type NetworkResolver = (
  hostname: string,
) => Promise<readonly NetworkAddress[]>;

export interface NetworkSafetyDecision {
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly checkedIp: string | null;
}

export interface NetworkResolution {
  readonly decision: NetworkSafetyDecision;
  readonly hostname: string | null;
  readonly addresses: readonly NetworkAddress[];
  readonly rejectedAddresses: readonly NetworkAddress[];
}
