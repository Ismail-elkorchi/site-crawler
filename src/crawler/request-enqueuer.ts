import { AsyncMutex } from "../core/concurrency/mutex.js";
import type { EnqueueDecision } from "../links/types.js";
import type { CrawlSource, ResolvedSeed } from "../requests/types.js";
import { EnqueueAccounting } from "./enqueue-accounting.js";
import { RequestEnqueueTransaction } from "./request-enqueue-transaction.js";

export type { RequestEnqueuerDependencies } from "./request-enqueue-types.js";
import type { RequestEnqueuerDependencies } from "./request-enqueue-types.js";

export class RequestEnqueuer {
  private readonly mutex = new AsyncMutex();
  private readonly accounting: EnqueueAccounting;
  private readonly transaction: RequestEnqueueTransaction;

  public constructor(deps: RequestEnqueuerDependencies) {
    this.accounting = new EnqueueAccounting({
      counters: deps.counters,
      frontier: deps.frontier,
      store: deps.store,
      onEnqueued: async (request) => await deps.onEnqueued(request),
    });
    this.transaction = new RequestEnqueueTransaction(deps, this.accounting);
  }

  public restore(): void {
    this.accounting.restore();
    this.transaction.restoreScopeReservations();
  }

  public async enqueue(
    rawUrl: string,
    referrerUrl: string | null,
    source: CrawlSource,
    depth: number,
    seed: ResolvedSeed | null,
    sitemapIndexDepth = 0,
    sitemapAncestors: readonly string[] = [],
  ): Promise<EnqueueDecision> {
    return await this.mutex.runExclusive(
      async () =>
        await this.transaction.execute(
          rawUrl,
          referrerUrl,
          source,
          depth,
          seed,
          sitemapIndexDepth,
          sitemapAncestors,
        ),
    );
  }
}
