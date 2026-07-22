import type { Frontier } from "../frontier/frontier.js";
import type { RequestLease } from "../frontier/types.js";
import type { CrawlCounters } from "./types.js";

export class LeaseHeartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;
  private current: RequestLease;
  private failure: Error | null = null;
  private chain: Promise<void> = Promise.resolve();
  private readonly frontier: Frontier;
  private readonly intervalMs: number;
  private readonly counters: CrawlCounters;
  private readonly onFailure: (error: Error) => void;
  private readonly onRenewed: (lease: RequestLease) => void;

  public constructor(
    frontier: Frontier,
    lease: RequestLease,
    intervalMs: number,
    counters: CrawlCounters,
    onFailure: (error: Error) => void,
    onRenewed: (lease: RequestLease) => void,
  ) {
    this.frontier = frontier;
    this.current = lease;
    this.intervalMs = intervalMs;
    this.counters = counters;
    this.onFailure = onFailure;
    this.onRenewed = onRenewed;
  }

  public start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.scheduleRenewal(), this.intervalMs);
  }

  public async stop(): Promise<RequestLease> {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    await this.chain;
    if (this.failure !== null) throw this.failure;
    return this.current;
  }

  private scheduleRenewal(): void {
    this.chain = this.chain.then(async () => {
      if (this.failure !== null) return;
      try {
        this.current = await this.frontier.renewLease(this.current);
        this.counters.renewedLeases += 1;
        this.onRenewed(this.current);
      } catch (caught) {
        this.failure =
          caught instanceof Error ? caught : new Error("Lease renewal failed.");
        this.onFailure(this.failure);
      }
    });
  }
}
