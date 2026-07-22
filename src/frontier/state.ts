import type { CrawlRequest } from "../requests/types.js";
import { sortRequests } from "./queue-order.js";
import type { DeferredRequest } from "./recovery.js";
import type { FrontierOrder, SeedRequestCount } from "./types.js";

export class FrontierState {
  private readonly queue: CrawlRequest[] = [];
  private readonly deferred: DeferredRequest[] = [];
  private readonly requestsByKey = new Map<string, CrawlRequest>();
  private readonly order: FrontierOrder;

  public constructor(order: FrontierOrder) {
    this.order = order;
  }

  public get size(): number {
    return this.queue.length + this.deferred.length;
  }

  public requestForKey(uniqueKey: string): CrawlRequest | null {
    return this.requestsByKey.get(uniqueKey) ?? null;
  }

  public seedRequestCounts(): readonly SeedRequestCount[] {
    const counts = new Map<string, number>();
    for (const request of this.requestsByKey.values()) {
      counts.set(request.seedUrl, (counts.get(request.seedUrl) ?? 0) + 1);
    }
    return [...counts.entries()].map(([seedUrl, count]) => ({
      seedUrl,
      count,
    }));
  }

  public knownRequests(): readonly CrawlRequest[] {
    return [...this.requestsByKey.values()];
  }

  public remember(request: CrawlRequest): void {
    this.requestsByKey.set(request.uniqueKey, request);
  }

  public addPending(request: CrawlRequest): void {
    this.remember(request);
    this.queue.push(request);
    sortRequests(this.queue, this.order);
  }

  public addDeferred(request: DeferredRequest): void {
    this.remember(request.request);
    this.deferred.push(request);
    this.deferred.sort((left, right) =>
      left.expiresAt.localeCompare(right.expiresAt),
    );
  }

  public takeNext(
    predicate: (request: CrawlRequest) => boolean = () => true,
  ): CrawlRequest | null {
    this.promoteDeferred();
    if (this.order === "dfs") {
      for (let index = this.queue.length - 1; index >= 0; index -= 1) {
        const request = this.queue[index];
        if (request !== undefined && predicate(request)) {
          this.queue.splice(index, 1);
          return request;
        }
      }
      return null;
    }
    const index = this.queue.findIndex(predicate);
    if (index < 0) return null;
    return this.queue.splice(index, 1)[0] ?? null;
  }

  public requeue(request: CrawlRequest): void {
    this.queue.push(request);
    sortRequests(this.queue, this.order);
  }

  public nextDeferredAt(): number | null {
    const first = this.deferred[0];
    return first === undefined ? null : Date.parse(first.expiresAt);
  }

  private promoteDeferred(): void {
    const now = Date.now();
    while (this.deferred.length > 0) {
      const first = this.deferred[0];
      if (first === undefined || Date.parse(first.expiresAt) > now) break;
      this.deferred.shift();
      this.queue.push(first.request);
    }
    sortRequests(this.queue, this.order);
  }
}
