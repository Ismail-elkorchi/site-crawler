import { crawlError } from "../diagnostics/factory.js";
import type { HtmlExtractionResult } from "../html/index.js";
import type { CrawlRequest } from "../requests/types.js";
import type { SessionManager } from "../http/session/index.js";
import type { ResultStore } from "../storage/index.js";
import type { ResolvedCrawlConfig } from "../config/types.js";
import type { RenderAdapter, RenderedPage } from "./types.js";
export interface RenderControllerDependencies {
  readonly runId: string;
  readonly config: ResolvedCrawlConfig;
  readonly renderer: RenderAdapter | null;
  readonly store: ResultStore;
  readonly session: SessionManager;
}
export class RenderController {
  private renderedPages = 0;
  private readonly deps: RenderControllerDependencies;
  public constructor(deps: RenderControllerDependencies) {
    this.deps = deps;
  }
  public renderedPageCount(): number {
    return this.renderedPages;
  }
  public shouldRender(
    request: CrawlRequest,
    extraction: HtmlExtractionResult,
  ): boolean {
    if (this.deps.renderer === null) return false;
    if (this.renderedPages >= this.deps.config.rendering.maxRenderedPages)
      return false;
    if (request.renderPolicy === "always") return true;
    if (request.renderPolicy === "never") return false;
    const lowText =
      extraction.facts.visibleText.text.length <
      this.deps.config.rendering.autoRenderMinTextLength;
    const noNavigationLinks = extraction.links.every(
      (link) => link.kind !== "navigation",
    );
    return lowText || noNavigationLinks;
  }
  public async render(
    request: CrawlRequest,
    finalUrl: string,
    signal: AbortSignal,
  ): Promise<RenderedPage | null> {
    if (this.deps.renderer === null) return null;
    this.renderedPages += 1;
    try {
      const cookies = await this.deps.session.renderCookies(finalUrl);
      const rendered = await this.deps.renderer.render(
        {
          url: finalUrl,
          requestId: request.id,
          timeoutMs: this.deps.config.rendering.navigationTimeoutMs,
          signal,
          headers: this.deps.config.network.headers,
          cookies,
          waitUntil: this.deps.config.rendering.waitUntil,
        },
        {
          runId: this.deps.runId,
          userAgent: this.deps.config.robots.userAgent,
          signal,
        },
      );
      await this.deps.session.captureRenderCookies(
        rendered.finalUrl,
        rendered.cookies,
      );
      return rendered;
    } catch (caught) {
      await this.deps.store.writeError(
        crawlError({
          code: "RENDER_ERROR",
          message: "Render adapter failed",
          url: finalUrl,
          requestId: request.id,
          cause: caught,
        }),
      );
      return null;
    }
  }
}
