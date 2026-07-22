import type { CrawlConfig } from "../config/types.js";
import { nowIso } from "../core/utils.js";
import type { CrawlError } from "../diagnostics/types.js";
import type { CrawlEventSubscription } from "../events/index.js";
import type { CrawlerExtensions } from "../extensions/types.js";
import { AbortRequestMonitor } from "../operations/abort-monitor.js";
import type { CrawlResult } from "../results/types.js";
import { fatalCrawlerError } from "./request-handler.js";
import { RuntimeFinalization } from "./runtime-finalization.js";
import { composeCrawlerRuntime } from "./runtime-composition.js";
import type { RuntimeComponents } from "./runtime-components.js";
import type { CrawlerContext } from "./types.js";

export class CrawlerRuntime {
  private readonly components: RuntimeComponents;
  private runStarted = false;

  public constructor(input: CrawlConfig, extensions?: CrawlerExtensions) {
    this.components = composeCrawlerRuntime(input, extensions);
  }

  public events(): CrawlEventSubscription {
    return this.components.dispatcher.events();
  }

  public abort(reason: string): void {
    this.components.controller.cancel(reason);
    this.components.dispatcher.emit({
      type: "cancellation-requested",
      runId: this.components.runId,
      reason,
      createdAt: nowIso(),
    });
  }

  public async run(): Promise<CrawlResult> {
    if (this.runStarted)
      throw new Error("A crawler runtime can only run once.");
    this.runStarted = true;
    const runtime = this.components;
    let storeInitialized = false;
    let abortMonitor: AbortRequestMonitor | null = null;
    runtime.controller.startClock();
    runtime.controller.beginInitialization();
    try {
      await runtime.store.init(
        runtime.finalizer.manifest("partial", null, null),
        runtime.config,
      );
      storeInitialized = true;
      abortMonitor = this.startAbortMonitor();
      await this.initializeFrontier();
      runtime.controller.beginRunning();
      runtime.dispatcher.emit({
        type: "run-started",
        runId: runtime.runId,
        createdAt: nowIso(),
      });
      await this.invokeRunStart();
      await this.bootstrapIfFreshRun();
      await runtime.workerPool.run();
      runtime.controller.completeFrontier();
    } catch (caught) {
      await this.captureFatal(caught, storeInitialized);
    } finally {
      abortMonitor?.stop();
    }
    return await this.finalize(storeInitialized);
  }

  private startAbortMonitor(): AbortRequestMonitor | null {
    const directory = this.components.store.outputDirectory;
    if (directory === null) return null;
    const monitor = new AbortRequestMonitor(
      directory,
      this.components.runId,
      (reason) => this.abort(reason),
    );
    monitor.start();
    return monitor;
  }

  private async initializeFrontier(): Promise<void> {
    const runtime = this.components;
    const restored = await runtime.frontier.init();
    runtime.counters.resumedRequests += restored.resumedRequests;
    runtime.counters.recoveredLeases += restored.recoveredLeases;
    runtime.scheduler.restoreAccounting();
  }

  private async bootstrapIfFreshRun(): Promise<void> {
    if (this.components.config.storage.resumeFrom !== null) return;
    await this.components.scheduler.enqueueSeeds();
    await this.components.scheduler.discoverSitemaps();
  }

  private async invokeRunStart(): Promise<void> {
    const hook = this.components.extensions.hooks.onRunStart;
    if (hook === undefined) return;
    await this.components.extensionRunner.invoke(
      "onRunStart hook",
      { scope: "run" },
      async () => await hook(this.context()),
    );
  }

  private async captureFatal(
    caught: unknown,
    storeInitialized: boolean,
  ): Promise<void> {
    const error = fatalCrawlerError(caught);
    this.components.controller.fail(error);
    if (storeInitialized) await this.tryWriteError(error);
    const hook = this.components.extensions.hooks.onFatalError;
    if (hook === undefined) return;
    try {
      await this.components.extensionRunner.invoke(
        "onFatalError hook",
        { scope: "run" },
        async () => await hook(this.context(), error),
      );
    } catch (hookError) {
      this.components.controller.fail(fatalCrawlerError(hookError));
    }
  }

  private async finalize(storeInitialized: boolean): Promise<CrawlResult> {
    return await new RuntimeFinalization(this.components, () =>
      this.context(),
    ).finalize(storeInitialized);
  }

  private async tryWriteError(error: CrawlError): Promise<void> {
    try {
      await this.components.store.writeError(error);
    } catch {
      return;
    }
  }

  private context(): CrawlerContext {
    return this.components.contextFactory.create();
  }
}
