import type { LinkDiscoveryEvidence } from "../discovery/types.js";

export type LinkSource =
  | "a[href]"
  | "area[href]"
  | "link[href]"
  | "link[imagesrcset]"
  | "script[src]"
  | "script-content"
  | "style-content"
  | "style[attribute]"
  | "img[src]"
  | "source[src]"
  | "source[srcset]"
  | "img[srcset]"
  | "iframe[src]"
  | "iframe[srcdoc]"
  | "form[action]"
  | "button[formaction]"
  | "input[src]"
  | "input[formaction]"
  | "audio[src]"
  | "video[src]"
  | "video[poster]"
  | "track[src]"
  | "object[data]"
  | "embed[src]"
  | "svg[href]"
  | "svg[xlink:href]"
  | "meta-refresh"
  | "http-link-header"
  | "sitemap"
  | "feed"
  | "redirect"
  | "hook";

export type LinkKind =
  | "navigation"
  | "canonical"
  | "alternate"
  | "hreflang"
  | "asset"
  | "image"
  | "script"
  | "stylesheet"
  | "iframe"
  | "form"
  | "media"
  | "manifest"
  | "preload"
  | "prefetch"
  | "object"
  | "redirect"
  | "sitemap-entry"
  | "feed-entry"
  | "script-discovery"
  | "css-discovery"
  | "source-map";

export type EnqueueDecisionStatus =
  | "enqueued"
  | "already_seen"
  | "rejected_scope"
  | "rejected_robots"
  | "rejected_network_safety"
  | "rejected_protocol"
  | "invalid_url"
  | "max_depth"
  | "queue_limit"
  | "user_rule"
  | "asset_skipped"
  | "duplicate"
  | "trap_guard";

export interface EnqueueDecision {
  readonly status: EnqueueDecisionStatus;
  readonly reason: string | null;
  readonly requestId: string | null;
}

export interface ExtractedLink {
  readonly raw: string;
  readonly source: LinkSource;
  readonly kind: LinkKind;
  readonly anchorText: string | null;
  readonly rel: readonly string[];
  readonly target: string | null;
  readonly evidence: LinkDiscoveryEvidence;
}

export interface LinkEdge {
  readonly schemaId: "site-crawler.linkEdge";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runId: string;
  readonly fromUrl: string;
  readonly toRaw: string;
  readonly toResolved: string | null;
  readonly toNormalized: string | null;
  readonly toFinalUrl: string | null;
  readonly source: LinkSource;
  readonly linkKind: LinkKind;
  readonly anchorText: string | null;
  readonly rel: readonly string[];
  readonly target: string | null;
  readonly nofollow: boolean;
  readonly sponsored: boolean;
  readonly ugc: boolean;
  readonly depth: number;
  readonly discoveredAt: string;
  readonly evidence: LinkDiscoveryEvidence;
  readonly enqueueDecision: EnqueueDecision;
}
