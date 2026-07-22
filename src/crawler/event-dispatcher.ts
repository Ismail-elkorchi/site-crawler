import { CrawlEventHub, type CrawlEventSubscription } from "../events/index.js";
import type { CrawlEvent } from "../events/types.js";
import type { ExtensionRunner } from "../extensions/runner.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { CrawlerContext } from "./types.js";

export class EventDispatcher {
  private readonly pendingHooks = new Set<Promise<void>>();
  private readonly hub: CrawlEventHub;
  private readonly extensions: ResolvedCrawlerExtensions;
  private readonly extensionRunner: ExtensionRunner;
  private readonly context: () => CrawlerContext;
  private readonly onFatalExtensionFailure: (error: Error) => void;

  public constructor(
    extensions: ResolvedCrawlerExtensions,
    extensionRunner: ExtensionRunner,
    context: () => CrawlerContext,
    onFatalExtensionFailure: (error: Error) => void,
  ) {
    this.extensions = extensions;
    this.extensionRunner = extensionRunner;
    this.context = context;
    this.onFatalExtensionFailure = onFatalExtensionFailure;
    this.hub = new CrawlEventHub(extensions.eventBufferCapacity);
  }

  public get droppedEvents(): number {
    return this.hub.droppedEvents;
  }

  public events(): CrawlEventSubscription {
    return this.hub.subscribe();
  }

  public emit(event: CrawlEvent): void {
    this.hub.emit(event);
    const hook = this.extensions.hooks.onEvent;
    if (hook === undefined) return;
    const pending = this.extensionRunner
      .invoke("onEvent hook", { scope: "run" }, async () => {
        await hook(this.context(), event);
      })
      .catch((caught: unknown) => {
        const error =
          caught instanceof Error ? caught : new Error("Event hook failed.");
        this.onFatalExtensionFailure(error);
      })
      .finally(() => this.pendingHooks.delete(pending));
    this.pendingHooks.add(pending);
  }

  public async prepareTerminal(
    event: Extract<CrawlEvent, { type: "run-finished" }>,
  ): Promise<void> {
    const hook = this.extensions.hooks.onEvent;
    if (hook === undefined) return;
    await this.extensionRunner.invoke(
      "onEvent terminal hook",
      { scope: "run" },
      async () => await hook(this.context(), event),
    );
  }

  public emitTerminal(
    event: Extract<CrawlEvent, { type: "run-finished" }>,
  ): void {
    this.hub.emit(event);
  }

  public async drain(): Promise<void> {
    while (this.pendingHooks.size > 0) {
      await Promise.allSettled([...this.pendingHooks]);
    }
  }

  public close(): void {
    this.hub.close();
  }
}
