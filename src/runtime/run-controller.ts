import type { ResolvedCrawlConfig } from "../config/types.js";
import type { StopReason } from "../core/types.js";
import { crawlError } from "../diagnostics/factory.js";
import type { CrawlError } from "../diagnostics/types.js";
import type { CrawlCounters } from "../crawler/types.js";
import type { LimitReason, RunPhase, StopDetail } from "./types.js";

const SOFT_LIMITS: ReadonlySet<LimitReason> = new Set([
  "max-scheduled-requests",
  "max-queue-size",
  "max-sitemap-files",
  "max-sitemap-entries",
  "max-sitemap-index-depth",
  "max-rendered-pages",
]);

export class RunController {
  private readonly abortController = new AbortController();
  private phaseValue: RunPhase = "created";
  private stopValue: StopDetail | null = null;
  private activeRequests = 0;
  private startedMsValue = performance.now();
  private readonly config: ResolvedCrawlConfig;
  private readonly counters: CrawlCounters;
  private readonly reportedLimits = new Set<LimitReason>();
  private onLimit: ((limit: LimitReason) => void) | null = null;

  public constructor(config: ResolvedCrawlConfig, counters: CrawlCounters) {
    this.config = config;
    this.counters = counters;
  }

  public get cancellationSignal(): AbortSignal {
    return this.abortController.signal;
  }

  public get phase(): RunPhase {
    return this.phaseValue;
  }

  public get stopDetail(): StopDetail | null {
    return this.stopValue;
  }

  public get fatalError(): CrawlError | null {
    const detail = this.stopValue;
    return detail?.kind === "fatal" ? detail.error : null;
  }

  public get startedMs(): number {
    return this.startedMsValue;
  }

  public get activeCount(): number {
    return this.activeRequests;
  }

  public startClock(): void {
    this.startedMsValue = performance.now();
  }

  public beginInitialization(): void {
    this.transition("created", "initializing");
  }

  public beginRunning(): void {
    this.transition("initializing", "running");
  }

  public beginDraining(): void {
    if (this.phaseValue === "running" || this.phaseValue === "stopping") {
      this.phaseValue = "draining";
    }
  }

  public beginFinalization(): void {
    if (this.phaseValue !== "closed") this.phaseValue = "finalizing";
  }

  public close(): void {
    this.phaseValue = "closed";
  }

  public cancel(reason: string): void {
    this.setStop({ kind: "cancelled", reason }, true);
  }

  public fail(error: CrawlError): void {
    this.setStop({ kind: "fatal", error }, true);
  }

  public failFromUnknown(cause: unknown): void {
    this.fail(
      crawlError({
        code: "INTERNAL_ERROR",
        message: "Fatal crawler runtime error",
        fatal: true,
        cause,
      }),
    );
  }

  public noteLimit(limit: LimitReason): void {
    this.setStop({ kind: "limit", limit }, false);
    if (!this.reportedLimits.has(limit)) {
      this.reportedLimits.add(limit);
      this.onLimit?.(limit);
    }
  }

  public observeLimits(observer: (limit: LimitReason) => void): void {
    this.onLimit = observer;
  }

  public completeFrontier(): void {
    if (this.stopValue === null) this.stopValue = { kind: "frontier-empty" };
  }

  public beginRequest(): void {
    this.activeRequests += 1;
    this.counters.requestsAttempted += 1;
    this.counters.peakConcurrency = Math.max(
      this.counters.peakConcurrency,
      this.activeRequests,
    );
  }

  public finishRequest(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  public recordFetched(bytes: number, responseTimeMs: number): void {
    this.counters.requestsFetched += 1;
    this.counters.bytesDownloaded += bytes;
    this.counters.responseCount += 1;
    this.counters.responseTimeMsTotal += responseTimeMs;
    this.refreshLimits();
  }

  public refreshLimits(): void {
    if (
      this.counters.requestsFetched >= this.config.limits.maxFetchedResources
    ) {
      this.noteLimit("max-fetched-resources");
    }
    if (
      performance.now() - this.startedMsValue >=
      this.config.limits.maxRunTimeMs
    ) {
      this.noteLimit("max-run-time");
    }
    if (
      this.counters.bytesDownloaded >= this.config.limits.maxDownloadedBytes
    ) {
      this.noteLimit("max-downloaded-bytes");
    }
  }

  public shouldLeaseMore(): boolean {
    this.refreshLimits();
    const detail = this.stopValue;
    if (detail === null || detail.kind === "frontier-empty") return true;
    if (detail.kind === "cancelled" || detail.kind === "fatal") return false;
    return SOFT_LIMITS.has(detail.limit);
  }

  public stopReason(): StopReason {
    const detail = this.stopValue;
    if (detail === null || detail.kind === "frontier-empty")
      return "frontier_empty";
    if (detail.kind === "limit") return "limit_reached";
    if (detail.kind === "cancelled") return "aborted";
    return "fatal_error";
  }

  private setStop(detail: StopDetail, abortActive: boolean): void {
    if (this.stopValue === null || detail.kind === "fatal")
      this.stopValue = detail;
    if (this.phaseValue === "running") this.phaseValue = "stopping";
    if (abortActive && !this.abortController.signal.aborted) {
      this.abortController.abort(detail);
    }
  }

  private transition(expected: RunPhase, next: RunPhase): void {
    if (this.phaseValue !== expected) {
      throw new Error(
        `Invalid run phase transition ${this.phaseValue} -> ${next}.`,
      );
    }
    this.phaseValue = next;
  }
}
