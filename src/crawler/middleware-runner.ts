import { crawlError } from "../diagnostics/factory.js";
import type { ExtensionRunner } from "../extensions/runner.js";
import type {
  RequestMiddlewareDecision,
  ResolvedCrawlerExtensions,
} from "../extensions/types.js";
import type { CrawlRequest } from "../requests/types.js";
import { abortableDelay } from "../runtime/abortable-delay.js";
import type { CrawledResource } from "../resources/types.js";
import type { ResultStore } from "../storage/index.js";
import type { CrawlerContext } from "./types.js";

export class MiddlewareRunner {
  private readonly extensions: ResolvedCrawlerExtensions;
  private readonly extensionRunner: ExtensionRunner;
  private readonly store: ResultStore;
  private readonly context: () => CrawlerContext;

  public constructor(
    extensions: ResolvedCrawlerExtensions,
    extensionRunner: ExtensionRunner,
    store: ResultStore,
    context: () => CrawlerContext,
  ) {
    this.extensions = extensions;
    this.extensionRunner = extensionRunner;
    this.store = store;
    this.context = context;
  }

  public async beforeRequest(
    request: CrawlRequest,
    signal: AbortSignal,
  ): Promise<Exclude<RequestMiddlewareDecision, { readonly kind: "delay" }>> {
    for (const [
      index,
      middleware,
    ] of this.extensions.middlewares.beforeRequest.entries()) {
      const decision = await this.extensionRunner.invokeValue(
        `beforeRequest middleware #${index + 1}`,
        { scope: "request", url: request.normalizedUrl, requestId: request.id },
        async () => await middleware(this.context(), request),
        { kind: "continue" },
      );
      if (decision.kind === "delay") {
        if (!Number.isFinite(decision.delayMs) || decision.delayMs < 0) {
          throw new TypeError("Request middleware delay must be non-negative.");
        }
        await abortableDelay(decision.delayMs, signal);
        continue;
      }
      if (decision.kind !== "continue") return decision;
    }
    return { kind: "continue" };
  }

  public async afterResource(
    resource: CrawledResource,
    abort: (reason: string) => void,
  ): Promise<"continue" | "abort" | "skip-processing"> {
    for (const [
      index,
      middleware,
    ] of this.extensions.middlewares.afterResource.entries()) {
      const decision = await this.extensionRunner.invokeValue(
        `afterResource middleware #${index + 1}`,
        resourceContext(resource),
        async () => await middleware(this.context(), resource),
        { kind: "continue" },
      );
      if (decision.kind === "continue") continue;
      if (decision.kind === "skip-processing") {
        await this.store.writeError(
          crawlError({
            code: "EXTENSION_ERROR",
            message: `Resource processing skipped: ${decision.reason}`,
            url: resource.finalUrl,
            requestId: resource.requestId,
          }),
        );
        return "skip-processing";
      }
      if (decision.kind === "abort") {
        abort(decision.reason);
        return "abort";
      }
      await this.store.writeError(decision.error);
    }
    return "continue";
  }
}

function resourceContext(
  resource: CrawledResource,
): import("../extensions/runner.js").ExtensionInvocationContext {
  return resource.finalUrl === null
    ? { scope: "request", requestId: resource.requestId }
    : {
        scope: "request",
        url: resource.finalUrl,
        requestId: resource.requestId,
      };
}
