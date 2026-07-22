import net from "node:net";
import type { NetworkSafetyConfig, NetworkSafetyDecision } from "./types.js";

const BLOCKED_V4: readonly CidrV4[] = [
  cidr4("0.0.0.0", 8),
  cidr4("10.0.0.0", 8),
  cidr4("100.64.0.0", 10),
  cidr4("127.0.0.0", 8),
  cidr4("169.254.0.0", 16),
  cidr4("172.16.0.0", 12),
  cidr4("192.0.0.0", 24),
  cidr4("192.0.2.0", 24),
  cidr4("192.88.99.0", 24),
  cidr4("192.168.0.0", 16),
  cidr4("198.18.0.0", 15),
  cidr4("198.51.100.0", 24),
  cidr4("203.0.113.0", 24),
  cidr4("224.0.0.0", 4),
  cidr4("240.0.0.0", 4),
];

const BLOCKED_V6: readonly CidrV6[] = [
  cidr6("::", 128),
  cidr6("::1", 128),
  cidr6("64:ff9b::", 96),
  cidr6("100::", 64),
  cidr6("2001::", 23),
  cidr6("2001:db8::", 32),
  cidr6("fc00::", 7),
  cidr6("fe80::", 10),
  cidr6("ff00::", 8),
];

interface CidrV4 {
  readonly base: number;
  readonly mask: number;
}

interface CidrV6 {
  readonly base: bigint;
  readonly mask: bigint;
}

export function decideIp(
  rawIp: string,
  config: NetworkSafetyConfig,
): NetworkSafetyDecision {
  const mapped = mappedIpv4(rawIp);
  const ip = mapped ?? rawIp;
  if (isLoopback(ip) && config.allowLocalhost) return allow(rawIp);
  if (isPrivateNetwork(ip) && config.allowPrivateNetworks) return allow(rawIp);
  if (isGlobalAddress(ip)) return allow(rawIp);
  return deny("Special-purpose network address blocked", rawIp);
}

function isGlobalAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    const value = ipv4Value(ip);
    return value !== null && !BLOCKED_V4.some((range) => inV4(value, range));
  }
  if (family === 6) {
    const value = ipv6Value(ip);
    return value !== null && !BLOCKED_V6.some((range) => inV6(value, range));
  }
  return false;
}

function isLoopback(ip: string): boolean {
  return ip === "::1" || ip.startsWith("127.");
}

function isPrivateNetwork(ip: string): boolean {
  const v4 = ipv4Value(ip);
  if (v4 !== null) {
    return (
      inV4(v4, cidr4("10.0.0.0", 8)) ||
      inV4(v4, cidr4("172.16.0.0", 12)) ||
      inV4(v4, cidr4("192.168.0.0", 16)) ||
      inV4(v4, cidr4("100.64.0.0", 10))
    );
  }
  const v6 = ipv6Value(ip);
  return v6 !== null && inV6(v6, cidr6("fc00::", 7));
}

function mappedIpv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  if (!lower.startsWith("::ffff:")) return null;
  const tail = lower.slice(7);
  if (net.isIP(tail) === 4) return tail;
  const groups = tail.split(":");
  if (groups.length !== 2) return null;
  const high = Number.parseInt(groups[0] ?? "", 16);
  const low = Number.parseInt(groups[1] ?? "", 16);
  if (!Number.isInteger(high) || !Number.isInteger(low)) return null;
  return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
}

function cidr4(address: string, prefix: number): CidrV4 {
  const value = ipv4Value(address) ?? 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { base: value & mask, mask };
}

function inV4(value: number, range: CidrV4): boolean {
  return (value & range.mask) >>> 0 === range.base >>> 0;
}

function ipv4Value(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const byte = Number(part);
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) return null;
    value = (value << 8) | byte;
  }
  return value >>> 0;
}

function cidr6(address: string, prefix: number): CidrV6 {
  const value = ipv6Value(address) ?? 0n;
  const mask =
    prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix);
  return { base: value & mask, mask };
}

function inV6(value: bigint, range: CidrV6): boolean {
  return (value & range.mask) === range.base;
}

function ipv6Value(ip: string): bigint | null {
  if (net.isIP(ip) !== 6) return null;
  const sides = ip.toLowerCase().split("::");
  if (sides.length > 2) return null;
  const left = groups(sides[0] ?? "");
  const right = groups(sides[1] ?? "");
  if (left === null || right === null) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (sides.length === 1 && missing !== 0)) return null;
  const all = [...left, ...Array.from({ length: missing }, () => 0), ...right];
  if (all.length !== 8) return null;
  return all.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

function groups(part: string): readonly number[] | null {
  if (part === "") return [];
  const values = part.split(":").map((group) => Number.parseInt(group, 16));
  return values.some(
    (value) => !Number.isInteger(value) || value < 0 || value > 0xffff,
  )
    ? null
    : values;
}

function allow(ip: string | null): NetworkSafetyDecision {
  return { allowed: true, reason: null, checkedIp: ip };
}

function deny(reason: string, ip: string | null): NetworkSafetyDecision {
  return { allowed: false, reason, checkedIp: ip };
}
