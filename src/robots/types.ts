export interface RobotsDecision {
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly source: "robots.txt" | "fallback" | "disabled" | "unknown";
  readonly matchedRule: string | null;
}

export interface RobotsConfig {
  readonly enabled: boolean;
  readonly userAgent: string;
  readonly productToken: string;
  readonly on4xx: "allow" | "disallow" | "seed-only";
  readonly on5xx: "allow" | "disallow" | "seed-only";
  readonly onNetworkError: "allow" | "disallow" | "seed-only";
  readonly respectCrawlDelay: boolean;
  readonly maxBytes: number;
  readonly cacheTtlMs: number;
}

export interface RobotsRecord {
  readonly schemaId: "site-crawler.robots";
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly origin: string;
  readonly requestedUrl: string;
  readonly finalUrl: string | null;
  readonly statusCode: number | null;
  readonly source: "network" | "cache" | "stale-cache" | "fallback";
  readonly fallbackMode: "allow" | "disallow" | "seed-only" | null;
  readonly groups: number;
  readonly rules: number;
  readonly sitemaps: readonly string[];
  readonly fetchedAt: string;
  readonly expiresAt: string;
  readonly error: string | null;
}
