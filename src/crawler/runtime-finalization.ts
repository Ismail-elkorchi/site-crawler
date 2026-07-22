import { nowIso } from "../core/utils.js";
import type { CrawlEvent } from "../events/types.js";
import type { CrawlResult } from "../results/types.js";
import { fatalCrawlerError } from "./request-handler.js";
import type { RuntimeComponents } from "./runtime-components.js";
import type { CrawlerContext } from "./types.js";

export class RuntimeFinalization {
  private readonly runtime: RuntimeComponents;
  private readonly context: () => CrawlerContext;

  public constructor(
    runtime: RuntimeComponents,
    context: () => CrawlerContext,
  ) {
    this.runtime = runtime;
    this.context = context;
  }

  public async finalize(storeInitialized: boolean): Promise<CrawlResult> {
    this.runtime.controller.beginDraining();
    await this.runtime.dispatcher.drain();
    await this.invokeRunFinish();
    await this.runtime.dispatcher.drain();
    this.runtime.controller.beginFinalization();
    await this.closeAuxiliary();

    let result = this.currentResult();
    if (storeInitialized) {
      result = await this.persistResult(result);
      await this.runtime.dispatcher.drain();
    }
    result = await this.invokeTerminalHook(result);
    if (storeInitialized) {
      result = await this.persistResult(result);
      await this.runtime.dispatcher.drain();
      result = await this.closeStore(result);
    }

    this.runtime.dispatcher.emitTerminal(this.terminalEvent(result));
    this.runtime.dispatcher.close();
    this.runtime.controller.close();
    return result;
  }

  private currentResult(): CrawlResult {
    return this.runtime.finalizer.result(this.runtime.controller.fatalError);
  }

  private async invokeRunFinish(): Promise<void> {
    const hook = this.runtime.extensions.hooks.onRunFinish;
    if (hook === undefined) return;
    try {
      await this.runtime.extensionRunner.invoke(
        "onRunFinish hook",
        { scope: "run" },
        async () => await hook(this.context(), this.currentResult()),
      );
    } catch (caught) {
      this.runtime.controller.fail(fatalCrawlerError(caught));
    }
  }

  private async closeAuxiliary(): Promise<void> {
    try {
      await this.runtime.finalizer.closeAuxiliary();
    } catch (caught) {
      const error = fatalCrawlerError(caught);
      this.runtime.controller.fail(error);
      await this.tryWriteError(error);
    }
  }

  private async invokeTerminalHook(result: CrawlResult): Promise<CrawlResult> {
    try {
      await this.runtime.dispatcher.prepareTerminal(this.terminalEvent(result));
      return result;
    } catch (caught) {
      this.runtime.controller.fail(fatalCrawlerError(caught));
      return this.currentResult();
    }
  }

  private async persistResult(initial: CrawlResult): Promise<CrawlResult> {
    try {
      await this.runtime.finalizer.persist(initial);
      this.runtime.dispatcher.emit({
        type: "storage-flushed",
        runId: this.runtime.runId,
        pendingWrites: 0,
        createdAt: nowIso(),
      });
      return initial;
    } catch (caught) {
      const error = fatalCrawlerError(caught);
      this.runtime.controller.fail(error);
      await this.tryWriteError(error);
      const failed = this.currentResult();
      await this.tryPersistMetadata(failed);
      return failed;
    }
  }

  private async closeStore(initial: CrawlResult): Promise<CrawlResult> {
    try {
      await this.runtime.store.close();
      return initial;
    } catch (caught) {
      const error = fatalCrawlerError(caught);
      this.runtime.controller.fail(error);
      await this.tryWriteError(error);
      const failed = this.currentResult();
      await this.tryPersistMetadata(failed);
      return failed;
    }
  }

  private async tryPersistMetadata(result: CrawlResult): Promise<void> {
    try {
      await this.runtime.finalizer.persistMetadata(result);
    } catch {
      return;
    }
  }

  private async tryWriteError(
    error: import("../diagnostics/types.js").CrawlError,
  ): Promise<void> {
    try {
      await this.runtime.store.writeError(error);
    } catch {
      return;
    }
  }

  private terminalEvent(
    result: CrawlResult,
  ): Extract<CrawlEvent, { type: "run-finished" }> {
    return {
      type: "run-finished",
      runId: this.runtime.runId,
      status: result.status,
      stopReason: result.stopReason,
      stopDetail: result.stopDetail,
      createdAt: nowIso(),
    };
  }
}
