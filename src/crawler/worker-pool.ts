import { nowIso } from "../core/utils.js";
import type { CrawlEvent } from "../events/types.js";
import type { Frontier, RequestLease } from "../frontier/index.js";
import type { PolitenessController } from "../politeness/index.js";
import type { RobotsService } from "../robots/index.js";
import type { RunController } from "../runtime/run-controller.js";
import { LeaseHeartbeat } from "./lease-heartbeat.js";
import type { RequestHandler } from "./request-handler.js";
import type { CrawlCounters, RequestOutcome } from "./types.js";

export interface WorkerPoolDependencies {
  readonly frontier: Frontier;
  readonly politeness: PolitenessController;
  readonly handler: RequestHandler;
  readonly robots: RobotsService;
  readonly controller: RunController;
  readonly counters: CrawlCounters;
  readonly workerCount: number;
  readonly leaseRenewalIntervalMs: number;
  readonly runId: string;
  emit(event: CrawlEvent): void;
}

export class WorkerPool {
  private readonly deps: WorkerPoolDependencies;

  public constructor(deps: WorkerPoolDependencies) {
    this.deps = deps;
  }

  public async run(): Promise<void> {
    const workers = Array.from(
      { length: this.deps.workerCount },
      async () => await this.workerLoop(),
    );
    const results = await Promise.allSettled(workers);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
  }

  private async workerLoop(): Promise<void> {
    while (this.deps.controller.shouldLeaseMore()) {
      const lease = await this.deps.frontier.leaseNext({
        tryReserve: (request) => this.deps.politeness.tryReserve(request),
        releaseReservation: (request) =>
          this.deps.politeness.releaseReservation(request),
      });
      if (lease === null) {
        if (this.shouldFinish()) return;
        await this.waitForWork();
        continue;
      }
      await this.processLease(lease);
    }
  }

  private async processLease(initialLease: RequestLease): Promise<void> {
    const heartbeat = this.heartbeat(initialLease);
    heartbeat.start();
    const origin = new URL(initialLease.request.normalizedUrl).origin;
    let started = false;
    let handled = false;
    let outcome: RequestOutcome = emptyOutcome();
    try {
      const robotsDelay = await this.deps.robots.crawlDelayMsFor(
        initialLease.request.normalizedUrl,
      );
      await this.deps.politeness.applyRobotsDelay(
        origin,
        robotsDelay ?? 0,
        this.deps.controller.cancellationSignal,
      );
      this.deps.controller.beginRequest();
      started = true;
      handled = true;
      outcome = await this.deps.handler.handle(
        initialLease,
        this.deps.controller.cancellationSignal,
      );
    } catch (caught) {
      if (!handled) await this.finishUnstartedLease(initialLease, caught);
      this.deps.controller.failFromUnknown(caught);
      throw caught;
    } finally {
      const heartbeatFailure = await stopHeartbeat(heartbeat);
      if (started) this.deps.controller.finishRequest();
      this.deps.politeness.release(origin, outcome);
      if (heartbeatFailure !== null) {
        this.deps.controller.failFromUnknown(heartbeatFailure);
        if (!handled) throw heartbeatFailure;
      }
    }
  }

  private heartbeat(lease: RequestLease): LeaseHeartbeat {
    return new LeaseHeartbeat(
      this.deps.frontier,
      lease,
      this.deps.leaseRenewalIntervalMs,
      this.deps.counters,
      (error) => this.deps.controller.failFromUnknown(error),
      (renewed) => {
        this.deps.emit({
          type: "lease-renewed",
          runId: this.deps.runId,
          requestId: renewed.request.id,
          expiresAt: renewed.expiresAt,
          createdAt: nowIso(),
        });
      },
    );
  }

  private shouldFinish(): boolean {
    return this.deps.frontier.outstandingCount === 0;
  }

  private async waitForWork(): Promise<void> {
    const deferredAt = this.deps.frontier.nextDeferredAt();
    const deferredWait =
      deferredAt === null ? 250 : Math.max(1, deferredAt - Date.now());
    await this.deps.politeness.waitForAvailability(
      this.deps.controller.cancellationSignal,
      Math.min(deferredWait, 250),
    );
  }

  private async finishUnstartedLease(
    lease: RequestLease,
    caught: unknown,
  ): Promise<void> {
    if (this.deps.controller.cancellationSignal.aborted) {
      await this.deps.handler.cancelLease(
        lease,
        "Run cancelled before request execution",
      );
      return;
    }
    await this.deps.frontier.release(
      lease,
      caught instanceof Error
        ? caught.message
        : "Worker failed before request execution",
    );
    this.deps.counters.releasedLeases += 1;
  }
}

function emptyOutcome(): RequestOutcome {
  return {
    kind: "cancelled",
    statusCode: null,
    responseTimeMs: 0,
    latencyMs: 0,
  };
}

async function stopHeartbeat(heartbeat: LeaseHeartbeat): Promise<Error | null> {
  try {
    await heartbeat.stop();
    return null;
  } catch (caught) {
    return caught instanceof Error
      ? caught
      : new Error("Lease heartbeat failed.");
  }
}
