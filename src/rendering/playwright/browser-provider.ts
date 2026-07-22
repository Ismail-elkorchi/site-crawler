import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserServer,
  type BrowserType,
} from "playwright-core";
import { AsyncMutex } from "../../core/concurrency/mutex.js";
import { withPlaywrightTimeout } from "./timeout.js";
import type { PlaywrightRenderAdapterOptions } from "./types.js";

type LaunchServerOptions = NonNullable<
  Parameters<BrowserType["launchServer"]>[0]
>;

interface BrowserState {
  readonly browser: Browser | null;
  readonly server: BrowserServer | null;
}

export class BrowserProvider {
  private browser: Browser | null = null;
  private server: BrowserServer | null = null;
  private readonly mutex = new AsyncMutex();
  private readonly options: PlaywrightRenderAdapterOptions;

  public constructor(options: PlaywrightRenderAdapterOptions) {
    this.options = options;
  }

  public async get(): Promise<Browser> {
    return await this.mutex.runExclusive(async () => {
      if (this.browser?.isConnected() === true) return this.browser;
      const type = browserType(this.options.browser);
      const server = await type.launchServer(launchOptions(this.options));
      try {
        const browser = await withPlaywrightTimeout(
          type.connect(server.wsEndpoint(), {
            timeout: this.options.launchTimeoutMs ?? 30_000,
          }),
          "Playwright browser connection",
          this.options.launchTimeoutMs ?? 30_000,
          () => {
            void server.kill().catch(() => undefined);
          },
        );
        this.server = server;
        this.browser = browser;
        return browser;
      } catch (caught) {
        await server.kill().catch(() => undefined);
        throw caught;
      }
    });
  }

  public async close(): Promise<void> {
    const state = await this.takeState();
    if (state.server !== null) {
      await this.closeServer(state.server);
      return;
    }
    if (state.browser !== null) {
      await withPlaywrightTimeout(
        state.browser.close(),
        "Playwright browser close",
        this.options.closeTimeoutMs ?? 10_000,
      );
    }
  }

  private async takeState(): Promise<BrowserState> {
    return await this.mutex.runExclusive(() => {
      const state: BrowserState = {
        browser: this.browser,
        server: this.server,
      };
      this.browser = null;
      this.server = null;
      return Promise.resolve(state);
    });
  }

  private async closeServer(server: BrowserServer): Promise<void> {
    const timeoutMs = this.options.closeTimeoutMs ?? 10_000;
    try {
      await withPlaywrightTimeout(
        server.close(),
        "Playwright browser-server close",
        timeoutMs,
        () => {
          void server.kill().catch(() => undefined);
        },
      );
    } catch (closeError) {
      try {
        await withPlaywrightTimeout(
          server.kill(),
          "Playwright browser-server kill",
          timeoutMs,
        );
      } catch (killError) {
        throw new AggregateError(
          [closeError, killError],
          "Playwright browser server could not be terminated.",
        );
      }
    }
  }
}

function browserType(
  name: PlaywrightRenderAdapterOptions["browser"],
): BrowserType {
  if (name === "firefox") return firefox;
  if (name === "webkit") return webkit;
  return chromium;
}

function launchOptions(
  options: PlaywrightRenderAdapterOptions,
): LaunchServerOptions {
  return {
    headless: options.headless ?? true,
    timeout: options.launchTimeoutMs ?? 30_000,
    ...(options.executablePath === undefined
      ? {}
      : { executablePath: options.executablePath }),
    ...(options.launchArgs === undefined
      ? {}
      : { args: [...options.launchArgs] }),
  };
}
