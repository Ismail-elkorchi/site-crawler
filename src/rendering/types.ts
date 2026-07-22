import type { CrawlWarning } from "../diagnostics/types.js";
import type { RenderPolicy } from "../requests/types.js";

export interface RenderingConfig {
  readonly mode: RenderPolicy;
  readonly maxRenderedPages: number;
  readonly navigationTimeoutMs: number;
  readonly extractionTimeoutMs: number;
  readonly autoRenderMinTextLength: number;
  readonly autoRenderWhenNoLinks: boolean;
  readonly autoRenderFrameworkShells: boolean;
  readonly autoRenderUrlPatterns: readonly string[];
  readonly waitUntil: "commit" | "domcontentloaded" | "load" | "networkidle";
}

export interface RenderCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly expires: number;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: "Strict" | "Lax" | "None";
}

export interface RenderRequest {
  readonly url: string;
  readonly requestId: string;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
  readonly headers: Readonly<Record<string, string>>;
  readonly cookies: readonly RenderCookie[];
  readonly waitUntil: RenderingConfig["waitUntil"];
}

export interface RenderContext {
  readonly runId: string;
  readonly userAgent: string;
  readonly signal: AbortSignal;
}

export interface RenderNetworkError {
  readonly url: string;
  readonly errorText: string;
}

export interface RenderedPage {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly html: string;
  readonly renderedAt: string;
  readonly durationMs: number;
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly networkErrors: readonly RenderNetworkError[];
  readonly screenshotPath: string | null;
  readonly cookies: readonly RenderCookie[];
  readonly warnings: readonly CrawlWarning[];
}

export interface RenderAdapter {
  readonly name: string;
  readonly version: string | null;
  render(request: RenderRequest, context: RenderContext): Promise<RenderedPage>;
  close?(): Promise<void>;
}
