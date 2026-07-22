import type {
  CssDiscoveryMethod,
  DiscoveryConfidence,
} from "../discovery/types.js";

export interface CssDiscoveryConfig {
  readonly enabled: boolean;
  readonly fetchStylesheets: boolean;
  readonly enqueueDiscoveredUrls: boolean;
  readonly maxStylesheetBytes: number;
  readonly maxUrlsPerStylesheet: number;
}

export interface CssDiscoveredUrl {
  readonly rawUrl: string;
  readonly method: CssDiscoveryMethod;
  readonly confidence: DiscoveryConfidence;
  readonly offset: number;
}

export type { CssDiscoveryMethod } from "../discovery/types.js";
