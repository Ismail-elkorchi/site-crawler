import path from "node:path";
import {
  ensurePrivateDirectory,
  protectPrivateFile,
} from "../../core/private-files.js";
import type { BrowserContextOptions } from "playwright-core";
import { AsyncSemaphore } from "../../core/concurrency/semaphore.js";
import { nowIso } from "../../core/utils.js";
import type {
  RenderAdapter,
  RenderContext,
  RenderRequest,
  RenderedPage,
} from "../types.js";
import { BrowserProvider } from "./browser-provider.js";
import { readRenderCookies } from "./cookies.js";
import { installInitScripts } from "./init-scripts.js";
import { PageObserver } from "./page-observer.js";
import { createRoutePolicy } from "./route-policy.js";
import { withPlaywrightTimeout } from "./timeout.js";
import type { PlaywrightRenderAdapterOptions } from "./types.js";

export class PlaywrightRenderAdapter implements RenderAdapter {
  public readonly name = "playwright";
  public readonly version = "1.61.1";
  private readonly options: PlaywrightRenderAdapterOptions;
  private readonly browser: BrowserProvider;
  private readonly semaphore: AsyncSemaphore;

  public constructor(options: PlaywrightRenderAdapterOptions) {
    this.options = options;
    this.browser = new BrowserProvider(options);
    this.semaphore = new AsyncSemaphore(options.maxConcurrency ?? 2);
  }

  public async render(
    request: RenderRequest,
    context: RenderContext,
  ): Promise<RenderedPage> {
    return await this.semaphore.run(request.signal, async () => {
      const timeoutMs =
        this.options.operationTimeoutMs ??
        Math.max(
          30_000,
          request.timeoutMs + (this.options.launchTimeoutMs ?? 30_000),
        );
      return await withPlaywrightTimeout(
        this.renderPage(request, context),
        "Playwright render",
        timeoutMs,
        () => {
          void this.browser.close().catch(() => undefined);
        },
      );
    });
  }

  public async close(): Promise<void> {
    await this.browser.close();
  }

  private async renderPage(
    request: RenderRequest,
    context: RenderContext,
  ): Promise<RenderedPage> {
    const startedAt = performance.now();
    const browser = await this.browser.get();
    const browserContext = await browser.newContext(
      contextOptions(request, context, this.options),
    );
    try {
      await installInitScripts(browserContext, this.options.initScripts);
      if (request.cookies.length > 0)
        await browserContext.addCookies([...request.cookies]);
      const page = await browserContext.newPage();
      const observer = new PageObserver();
      observer.attach(page);
      await page.route("**/*", createRoutePolicy(this.options));
      const abort = (): void => {
        page.close().catch(() => undefined);
      };
      request.signal.addEventListener("abort", abort, { once: true });
      try {
        await page.goto(request.url, {
          timeout: request.timeoutMs,
          waitUntil: request.waitUntil,
        });
        const html = await page.content();
        const screenshotPath = await this.screenshot(page, request.requestId);
        const cookies = await readRenderCookies(browserContext);
        return {
          requestedUrl: request.url,
          finalUrl: page.url(),
          html,
          renderedAt: nowIso(),
          durationMs: performance.now() - startedAt,
          consoleErrors: observer.consoleErrors,
          pageErrors: observer.pageErrors,
          networkErrors: observer.networkErrors,
          screenshotPath,
          cookies,
          warnings: [],
        };
      } finally {
        request.signal.removeEventListener("abort", abort);
      }
    } finally {
      await withPlaywrightTimeout(
        browserContext.close(),
        "Playwright browser context close",
        this.options.closeTimeoutMs ?? 10_000,
      );
    }
  }

  private async screenshot(
    page: import("playwright-core").Page,
    requestId: string,
  ): Promise<string | null> {
    const directory = this.options.screenshotDirectory;
    if (directory === undefined || directory === null) return null;
    await ensurePrivateDirectory(directory);
    const target = path.join(directory, `${safeName(requestId)}.png`);
    await page.screenshot({
      path: target,
      fullPage: this.options.fullPageScreenshot ?? true,
    });
    await protectPrivateFile(target);
    return target;
  }
}

function contextOptions(
  request: RenderRequest,
  context: RenderContext,
  options: PlaywrightRenderAdapterOptions,
): BrowserContextOptions {
  return {
    userAgent: context.userAgent,
    extraHTTPHeaders: { ...request.headers },
    ignoreHTTPSErrors: options.ignoreHttpsErrors ?? false,
    viewport: options.viewport ?? { width: 1365, height: 768 },
  };
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/gu, "_");
}
