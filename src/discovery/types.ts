import type { SourcePosition } from "../core/types.js";

export type DiscoveryConfidence = "high" | "medium" | "low";

export type JavascriptDiscoveryMethod =
  | "absolute-literal"
  | "relative-literal"
  | "fetch-call"
  | "xhr-open"
  | "dynamic-import"
  | "url-constructor"
  | "source-map";

export type CssDiscoveryMethod = "import" | "url" | "source-map";

export type HtmlDiscoveryMethod =
  "attribute" | "srcset" | "meta-refresh" | "inline-css" | "srcdoc";

export type LinkDiscoveryEvidence =
  | {
      readonly kind: "html";
      readonly method: HtmlDiscoveryMethod;
      readonly element: string;
      readonly attribute: string | null;
      readonly position: SourcePosition | null;
    }
  | {
      readonly kind: "javascript";
      readonly method: JavascriptDiscoveryMethod;
      readonly confidence: DiscoveryConfidence;
      readonly offset: number | null;
    }
  | {
      readonly kind: "css";
      readonly method: CssDiscoveryMethod;
      readonly confidence: DiscoveryConfidence;
      readonly offset: number;
    }
  | {
      readonly kind: "http-header";
      readonly method: "link-header";
      readonly index: number;
    };
