import type { RunStatus, StopReason } from "../core/types.js";
import type { CrawlErrorCode, SkipReason } from "../diagnostics/types.js";
import type { ResourceType } from "../resources/types.js";
import type { LimitReason, StopDetail } from "../runtime/types.js";

export type CrawlEvent =
  | {
      readonly type: "run-started";
      readonly runId: string;
      readonly createdAt: string;
    }
  | {
      readonly type: "run-finished";
      readonly runId: string;
      readonly status: RunStatus;
      readonly stopReason: StopReason | null;
      readonly stopDetail: StopDetail | null;
      readonly createdAt: string;
    }
  | {
      readonly type: "cancellation-requested";
      readonly runId: string;
      readonly reason: string;
      readonly createdAt: string;
    }
  | {
      readonly type: "request-enqueued";
      readonly runId: string;
      readonly requestId: string;
      readonly url: string;
      readonly createdAt: string;
    }
  | {
      readonly type: "request-skipped";
      readonly runId: string;
      readonly url: string;
      readonly reason: SkipReason;
      readonly createdAt: string;
    }
  | {
      readonly type: "request-started";
      readonly runId: string;
      readonly requestId: string;
      readonly url: string;
      readonly createdAt: string;
    }
  | {
      readonly type: "request-finished";
      readonly runId: string;
      readonly requestId: string;
      readonly url: string;
      readonly outcome: "fetched" | "failed" | "skipped" | "cancelled";
      readonly createdAt: string;
    }
  | {
      readonly type: "request-failed";
      readonly runId: string;
      readonly requestId: string | null;
      readonly url: string | null;
      readonly code: CrawlErrorCode;
      readonly createdAt: string;
    }
  | {
      readonly type: "retry-scheduled";
      readonly runId: string;
      readonly requestId: string;
      readonly attempt: number;
      readonly delayMs: number;
      readonly createdAt: string;
    }
  | {
      readonly type: "redirect-followed";
      readonly runId: string;
      readonly requestId: string;
      readonly fromUrl: string;
      readonly toUrl: string;
      readonly statusCode: number;
      readonly createdAt: string;
    }
  | {
      readonly type: "redirect-blocked";
      readonly runId: string;
      readonly requestId: string;
      readonly fromUrl: string;
      readonly toUrl: string;
      readonly statusCode: number;
      readonly reason: string;
      readonly createdAt: string;
    }
  | {
      readonly type: "lease-renewed";
      readonly runId: string;
      readonly requestId: string;
      readonly expiresAt: string;
      readonly createdAt: string;
    }
  | {
      readonly type: "throttle-changed";
      readonly runId: string;
      readonly origin: string;
      readonly previousDelayMs: number;
      readonly delayMs: number;
      readonly reason: "robots" | "error" | "success";
      readonly createdAt: string;
    }
  | {
      readonly type: "robots-fetched";
      readonly runId: string;
      readonly origin: string;
      readonly statusCode: number | null;
      readonly source: "network" | "fallback" | "stale-cache";
      readonly createdAt: string;
    }
  | {
      readonly type: "render-started";
      readonly runId: string;
      readonly requestId: string;
      readonly url: string;
      readonly createdAt: string;
    }
  | {
      readonly type: "render-finished";
      readonly runId: string;
      readonly requestId: string;
      readonly url: string;
      readonly success: boolean;
      readonly durationMs: number;
      readonly createdAt: string;
    }
  | {
      readonly type: "html-parsed";
      readonly runId: string;
      readonly requestId: string;
      readonly url: string;
      readonly source: "http" | "rendered";
      readonly links: number;
      readonly createdAt: string;
    }
  | {
      readonly type: "xml-parsed";
      readonly runId: string;
      readonly requestId: string;
      readonly url: string;
      readonly xmlKind:
        "sitemap" | "sitemap-index" | "feed" | "generic-xml" | "unknown-xml";
      readonly entries: number;
      readonly createdAt: string;
    }
  | {
      readonly type: "progress-snapshot";
      readonly runId: string;
      readonly scheduled: number;
      readonly fetched: number;
      readonly outstanding: number;
      readonly createdAt: string;
    }
  | {
      readonly type: "resource-classified";
      readonly runId: string;
      readonly requestId: string;
      readonly resourceType: ResourceType;
      readonly createdAt: string;
    }
  | {
      readonly type: "links-extracted";
      readonly runId: string;
      readonly requestId: string;
      readonly count: number;
      readonly createdAt: string;
    }
  | {
      readonly type: "storage-flushed";
      readonly runId: string;
      readonly pendingWrites: number;
      readonly createdAt: string;
    }
  | {
      readonly type: "storage-backpressure";
      readonly runId: string;
      readonly pendingWrites: number;
      readonly createdAt: string;
    }
  | {
      readonly type: "limit-reached";
      readonly runId: string;
      readonly limit: LimitReason;
      readonly createdAt: string;
    };
