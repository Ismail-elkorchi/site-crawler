import { crawlError } from "../diagnostics/factory.js";
import type { CrawlError } from "../diagnostics/types.js";
import type { ResultStore } from "../storage/types.js";
import { ExtensionFailure } from "./failure.js";
import type { ExtensionFailureMode } from "./types.js";
export type ExtensionScope = "request" | "run";
export interface ExtensionInvocationContext {
  readonly scope: ExtensionScope;
  readonly url?: string;
  readonly requestId?: string;
}
export class ExtensionRunner {
  private readonly mode: ExtensionFailureMode;
  private readonly store: ResultStore;
  public constructor(mode: ExtensionFailureMode, store: ResultStore) {
    this.mode = mode;
    this.store = store;
  }
  public async invoke(
    name: string,
    context: ExtensionInvocationContext,
    action: () => void | Promise<void>,
  ): Promise<void> {
    await this.invokeValue(name, context, action, undefined);
  }
  public async invokeValue<T>(
    name: string,
    context: ExtensionInvocationContext,
    action: () => T | Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await action();
    } catch (caught) {
      const effectiveMode =
        context.scope === "run" && this.mode === "fail-request"
          ? "fail-run"
          : this.mode;
      const error = extensionError(name, effectiveMode, context, caught);
      await this.store.writeError(error);
      if (effectiveMode !== "record")
        throw new ExtensionFailure(name, effectiveMode, error);
      return fallback;
    }
  }
}
function extensionError(
  name: string,
  mode: ExtensionFailureMode,
  context: ExtensionInvocationContext,
  cause: unknown,
): CrawlError {
  return crawlError({
    code: "EXTENSION_ERROR",
    message: `Extension '${name}' failed.`,
    url: context.url ?? null,
    requestId: context.requestId ?? null,
    fatal: mode === "fail-run",
    cause,
  });
}
