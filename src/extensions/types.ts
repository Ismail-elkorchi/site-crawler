import type { CrawlError, SkipReason } from "../diagnostics/types.js";
import type { CrawlEvent } from "../events/types.js";
import type { CrawledHtmlPage } from "../html/types.js";
import type { HttpClient } from "../http/types.js";
import type { LinkEdge } from "../links/types.js";
import type { RenderAdapter } from "../rendering/types.js";
import type { CrawlRequest } from "../requests/types.js";
import type { CrawledResource } from "../resources/types.js";
import type { CrawlResult, SkippedUrl } from "../results/types.js";
import type { CrawledXmlResource } from "../xml/types.js";
import type { CrawlerContext, RequestOutcome } from "../crawler/types.js";
export type ExtensionFailureMode = "record" | "fail-request" | "fail-run";
export type RequestMiddlewareDecision =
  | { readonly kind: "continue" }
  | {
      readonly kind: "delay";
      readonly delayMs: number;
      readonly reason: string;
    }
  | {
      readonly kind: "skip";
      readonly reason: SkipReason;
      readonly detail: string;
    }
  | { readonly kind: "fail"; readonly error: CrawlError }
  | { readonly kind: "abort"; readonly reason: string };

export type ResourceMiddlewareDecision =
  | { readonly kind: "continue" }
  | { readonly kind: "skip-processing"; readonly reason: string }
  | { readonly kind: "fail"; readonly error: CrawlError }
  | { readonly kind: "abort"; readonly reason: string };

export type MiddlewareDecision =
  RequestMiddlewareDecision | ResourceMiddlewareDecision;
export type RequestMiddleware = (
  context: CrawlerContext,
  request: CrawlRequest,
) => Promise<RequestMiddlewareDecision> | RequestMiddlewareDecision;
export type ResourceMiddleware = (
  context: CrawlerContext,
  resource: CrawledResource,
) => Promise<ResourceMiddlewareDecision> | ResourceMiddlewareDecision;
export interface CrawlerMiddlewares {
  readonly beforeRequest: readonly RequestMiddleware[];
  readonly afterResource: readonly ResourceMiddleware[];
}
export interface CrawlerHooks {
  readonly onRunStart?: (context: CrawlerContext) => void | Promise<void>;
  readonly onRunFinish?: (
    context: CrawlerContext,
    result: CrawlResult,
  ) => void | Promise<void>;
  readonly onEvent?: (
    context: CrawlerContext,
    event: CrawlEvent,
  ) => void | Promise<void>;
  readonly onRequestEnqueued?: (
    context: CrawlerContext,
    request: CrawlRequest,
  ) => void | Promise<void>;
  readonly onRequestSkipped?: (
    context: CrawlerContext,
    skipped: SkippedUrl,
  ) => void | Promise<void>;
  readonly beforeRequest?: (
    context: CrawlerContext,
    request: CrawlRequest,
  ) => void | Promise<void>;
  readonly afterResponse?: (
    context: CrawlerContext,
    resource: CrawledResource,
  ) => void | Promise<void>;
  readonly onHtmlParsed?: (
    context: CrawlerContext,
    page: CrawledHtmlPage,
  ) => void | Promise<void>;
  readonly onXmlParsed?: (
    context: CrawlerContext,
    resource: CrawledXmlResource,
  ) => void | Promise<void>;
  readonly onLinksExtracted?: (
    context: CrawlerContext,
    links: readonly LinkEdge[],
  ) => void | Promise<void>;
  readonly onRequestFailed?: (
    context: CrawlerContext,
    error: CrawlError,
  ) => void | Promise<void>;
  readonly onFatalError?: (
    context: CrawlerContext,
    error: CrawlError,
  ) => void | Promise<void>;
}
export interface CrawlerExtensions {
  readonly renderer?: RenderAdapter;
  readonly httpClient?: HttpClient;
  readonly hooks?: CrawlerHooks;
  readonly middlewares?: Partial<CrawlerMiddlewares>;
  readonly failureMode?: ExtensionFailureMode;
  readonly eventBufferCapacity?: number;
}
export interface ResolvedCrawlerExtensions {
  readonly renderer: RenderAdapter | null;
  readonly httpClient: HttpClient | null;
  readonly hooks: CrawlerHooks;
  readonly middlewares: CrawlerMiddlewares;
  readonly failureMode: ExtensionFailureMode;
  readonly eventBufferCapacity: number;
}
export interface ExtensionRequestFailure {
  readonly kind: "request-failure";
  readonly outcome: RequestOutcome;
}
