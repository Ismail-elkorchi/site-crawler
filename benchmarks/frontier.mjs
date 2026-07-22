import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveConfig } from "../dist/config/public.js";
import { Frontier } from "../dist/frontier/index.js";

export async function benchmarkFrontier(requestCount = 10_000) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "site-crawler-bench-frontier-"),
  );
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    robots: { enabled: false },
    sitemaps: { enabled: false },
    limits: {
      maxScheduledRequests: requestCount,
      maxFetchedResources: requestCount,
      maxQueueSize: requestCount,
      maxDepth: 10,
    },
    storage: {
      type: "sqlite",
      directory,
      frontierBackend: "sqlite",
      frontierOrder: "priority",
      writeNdjsonExports: false,
    },
  });
  const frontier = new Frontier("benchmark_frontier", config);
  const seed = config.seeds[0];
  assert.notEqual(seed, undefined);
  const memoryBefore = process.memoryUsage().rss;
  const startedAt = performance.now();
  await frontier.init();
  try {
    const batchSize = 1_000;
    for (let offset = 0; offset < requestCount; offset += batchSize) {
      const inputs = Array.from(
        { length: Math.min(batchSize, requestCount - offset) },
        (_, index) => ({
          rawUrl: `https://example.com/page/${offset + index}`,
          referrerUrl: seed.normalizedUrl,
          source: "html-link",
          depth: 1,
          seed,
        }),
      );
      const results = await frontier.enqueueMany(inputs);
      assert.equal(
        results.every((result) => result.decision.status === "enqueued"),
        true,
      );
    }
    const enqueueFinishedAt = performance.now();
    const leaseCount = Math.min(1_000, requestCount);
    for (let index = 0; index < leaseCount; index += 1) {
      const lease = await frontier.leaseNext();
      assert.notEqual(lease, null);
      await frontier.markHandled(lease);
    }
    await frontier.flush();
    return {
      name: "sqlite-frontier",
      requestCount,
      leaseCount,
      enqueueMs: enqueueFinishedAt - startedAt,
      totalMs: performance.now() - startedAt,
      rssDeltaBytes: process.memoryUsage().rss - memoryBefore,
      remaining: frontier.outstandingCount,
    };
  } finally {
    await frontier.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}
