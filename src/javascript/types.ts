import type {
  DiscoveryConfidence,
  JavascriptDiscoveryMethod,
} from "../discovery/types.js";

export type JavascriptDiscoveryMode = "regex" | "ast" | "hybrid";

export interface JsDiscoveryConfig {
  readonly enabled: boolean;
  readonly mode: JavascriptDiscoveryMode;
  readonly enqueueDiscoveredUrls: boolean;
  readonly fetchScriptAssets: boolean;
  readonly maxScriptBytes: number;
  readonly maxUrlsPerScript: number;
}

export interface JavascriptDiscoveredUrl {
  readonly rawUrl: string;
  readonly method: JavascriptDiscoveryMethod;
  readonly confidence: DiscoveryConfidence;
  readonly offset: number | null;
}

export type { JavascriptDiscoveryMethod } from "../discovery/types.js";
