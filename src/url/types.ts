export type ScopeMode = "origin" | "host" | "domain" | "custom";
export interface ScopeConfig {
  readonly mode: ScopeMode;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly allowedHosts: readonly string[];
  readonly deniedHosts: readonly string[];
  readonly maxUrlLength: number;
  readonly maxPathSegments: number;
  readonly maxQueryParams: number;
  readonly maxUrlsPerDirectory: number;
  readonly maxUrlsPerPathPattern: number;
}
export type PartialScopeConfig = Partial<ScopeConfig>;
export interface ScopeDecision {
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly policyName: string | null;
}
export interface NormalizedUrl {
  readonly rawUrl: string;
  readonly baseUrl: string | null;
  readonly resolvedUrl: string;
  readonly normalizedUrl: string;
  readonly displayUrl: string;
}
