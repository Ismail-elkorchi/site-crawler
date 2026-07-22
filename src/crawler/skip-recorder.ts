import { nowIso } from "../core/utils.js";
import type { ExtensionRunner } from "../extensions/runner.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { SkippedUrl } from "../results/types.js";
import type { ResultStore } from "../storage/index.js";
import type { CrawlerContext, CrawlCounters } from "./types.js";

export interface SkipRecorderDependencies {
  readonly runId: string;
  readonly writeSkippedUrls: boolean;
  readonly counters: CrawlCounters;
  readonly extensions: ResolvedCrawlerExtensions;
  readonly extensionRunner: ExtensionRunner;
  readonly store: ResultStore;
  context(): CrawlerContext;
  emit(event: {
    readonly type: "request-skipped";
    readonly runId: string;
    readonly url: string;
    readonly reason: SkippedUrl["reason"];
    readonly createdAt: string;
  }): void;
}

export class SkipRecorder {
  private readonly deps: SkipRecorderDependencies;

  public constructor(deps: SkipRecorderDependencies) {
    this.deps = deps;
  }

  public async create(
    rawUrl: string,
    referrerUrl: string | null,
    resolvedUrl: string | null,
    normalizedUrl: string | null,
    reason: SkippedUrl["reason"],
    policyName: string | null,
    detail: string | null,
  ): Promise<void> {
    await this.record({
      schemaId: "site-crawler.skippedUrl",
      schemaVersion: 1,
      runId: this.deps.runId,
      rawUrl,
      resolvedUrl,
      normalizedUrl,
      referrerUrl,
      reason,
      policyName,
      detail,
      createdAt: nowIso(),
    });
  }

  public async record(skipped: SkippedUrl): Promise<void> {
    this.deps.counters.urlsSkipped += 1;
    incrementPolicyCounter(this.deps.counters, skipped.reason);
    if (this.deps.writeSkippedUrls) {
      await this.deps.store.writeSkipped(skipped);
    }
    this.deps.emit({
      type: "request-skipped",
      runId: this.deps.runId,
      url: skipped.normalizedUrl ?? skipped.rawUrl,
      reason: skipped.reason,
      createdAt: nowIso(),
    });

    const hook = this.deps.extensions.hooks.onRequestSkipped;
    if (hook === undefined) return;
    await this.deps.extensionRunner.invoke(
      "onRequestSkipped hook",
      { scope: "request", url: skipped.normalizedUrl ?? skipped.rawUrl },
      async () => {
        await hook(this.deps.context(), skipped);
      },
    );
  }
}

function incrementPolicyCounter(
  counters: CrawlCounters,
  reason: SkippedUrl["reason"],
): void {
  if (reason === "SCOPE_REJECTED") counters.scopeRejectedUrls += 1;
  if (reason === "ROBOTS_DISALLOWED") counters.robotsDisallowedUrls += 1;
  if (reason === "NETWORK_SAFETY_REJECTED") {
    counters.networkSafetyRejectedUrls += 1;
  }
}
