import type { ConfigFingerprints } from "../config/fingerprint.js";
import type { ResolvedCrawlConfig } from "../config/types.js";
import type { RunStatus } from "../core/types.js";
import { SITE_CRAWLER_VERSION } from "../core/version.js";
import type { CrawlError } from "../diagnostics/types.js";
import type { ResolvedCrawlerExtensions } from "../extensions/types.js";
import type { Frontier } from "../frontier/index.js";
import type { SessionManager } from "../http/session/index.js";
import type { HttpClient } from "../http/types.js";
import type { ResourceProcessor } from "../resources/resource-processor.js";
import { createRunRuntimeMetadata, isSensitiveRun } from "./run-metadata.js";
import type { CrawlResult, RunManifest } from "../results/types.js";
import type { RunController } from "../runtime/run-controller.js";
import type { ResultStore } from "../storage/index.js";
import { createCrawlStats, createRunManifest } from "./run-records.js";
import type { CrawlCounters } from "./types.js";

export interface RunFinalizerDependencies {
  readonly runId: string;
  readonly startedAt: string;
  readonly config: ResolvedCrawlConfig;
  readonly fingerprints: ConfigFingerprints;
  readonly extensions: ResolvedCrawlerExtensions;
  readonly counters: CrawlCounters;
  readonly store: ResultStore;
  readonly frontier: Frontier;
  readonly httpClient: HttpClient;
  readonly session: SessionManager;
  readonly resources: ResourceProcessor;
  readonly controller: RunController;
  readonly htmlParserVersion: string | null;
  readonly xmlParserVersion: string | null;
}

export class RunFinalizer {
  private readonly deps: RunFinalizerDependencies;

  public constructor(deps: RunFinalizerDependencies) {
    this.deps = deps;
  }

  public manifest(
    status: RunStatus,
    finishedAt: string | null,
    fatalError: CrawlError | null,
  ): RunManifest {
    const stats = createCrawlStats({
      runId: this.deps.runId,
      startedAt: this.deps.startedAt,
      startedMs: this.deps.controller.startedMs,
      seeds: this.deps.config.seeds.length,
      counters: this.deps.counters,
      renderedPages: this.deps.resources.renderedPageCount(),
      stopDetail: this.deps.controller.stopDetail,
      evidence: this.deps.store.evidenceStats(),
    });
    return createRunManifest({
      runId: this.deps.runId,
      crawlerVersion: SITE_CRAWLER_VERSION,
      startedAt: this.deps.startedAt,
      finishedAt,
      status,
      stopDetail: this.deps.controller.stopDetail,
      seeds: this.deps.config.seeds,
      outputDirectory: this.deps.store.outputDirectory,
      rawSnapshotsEnabled:
        this.deps.config.storage.storeRawHtml ||
        this.deps.config.storage.storeRawXml,
      resumedFrom: this.deps.config.storage.resumeFrom,
      fatalError,
      stats,
      fingerprints: this.deps.fingerprints,
      runtime: createRunRuntimeMetadata(this.deps.config, this.deps.extensions),
      sensitive: isSensitiveRun(this.deps.config),
      htmlParserVersion: this.deps.htmlParserVersion,
      xmlParserVersion: this.deps.xmlParserVersion,
    });
  }

  public result(fatalError: CrawlError | null): CrawlResult {
    const status = statusForRun(
      this.deps.controller.stopReason(),
      fatalError,
      this.deps.counters.requestsFailed,
    );
    const manifest = this.manifest(
      status,
      new Date().toISOString(),
      fatalError,
    );
    return {
      schemaId: "site-crawler.result",
      schemaVersion: 1,
      schemaSetVersion: manifest.schemaSetVersion,
      runId: this.deps.runId,
      status,
      stopReason: manifest.stopReason,
      stopDetail: manifest.stopDetail,
      outputDirectory: this.deps.store.outputDirectory,
      manifestPath:
        this.deps.store.outputDirectory === null
          ? null
          : `${this.deps.store.outputDirectory}/manifest.json`,
      stats: manifest.stats,
      fatalError,
    };
  }

  public async persist(result: CrawlResult): Promise<void> {
    await this.persistMetadata(result);
    await this.deps.store.flush();
  }

  public async persistMetadata(result: CrawlResult): Promise<void> {
    await this.deps.store.writeStats(result.stats);
    await this.deps.store.writeManifest(
      this.manifest(result.status, result.stats.finishedAt, result.fatalError),
    );
    if (this.deps.config.output.writeSummary) {
      await this.deps.store.writeSummary(result);
    }
  }

  public async closeAuxiliary(): Promise<void> {
    const operations: Promise<void>[] = [
      this.deps.frontier.close(),
      this.deps.session.close(),
    ];
    if (this.deps.httpClient.close !== undefined) {
      operations.push(this.deps.httpClient.close());
    }
    if (this.deps.extensions.renderer?.close !== undefined) {
      operations.push(this.deps.extensions.renderer.close());
    }
    const results = await Promise.allSettled(operations);
    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, "Crawler auxiliary shutdown failed.");
    }
  }
}

function statusForRun(
  stopReason: CrawlResult["stopReason"],
  fatal: CrawlError | null,
  requestsFailed: number,
): RunStatus {
  if (fatal !== null || stopReason === "fatal_error") return "failed";
  if (stopReason === "aborted") return "aborted";
  if (stopReason === "limit_reached") return "stopped_by_limit";
  return requestsFailed > 0 ? "partial" : "completed";
}
