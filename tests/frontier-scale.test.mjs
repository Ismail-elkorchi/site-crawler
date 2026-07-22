import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/public.js";
import { Frontier } from "../dist/frontier/index.js";
import { temporaryDirectory } from "./helpers.mjs";

function frontierConfig(root, storage = {}) {
  return resolveConfig({
    seeds: ["https://example.com/"],
    robots: { enabled: false },
    sitemaps: { enabled: false },
    limits: {
      maxScheduledRequests: 10_000,
      maxFetchedResources: 10_000,
      maxQueueSize: 10_000,
      maxDepth: 10,
    },
    storage: {
      type: "sqlite",
      directory: root,
      frontierBackend: "sqlite",
      ...storage,
    },
  });
}

function enqueueInput(seed, index, source = "html-link") {
  return {
    rawUrl: `https://example.com/page/${index}`,
    referrerUrl: seed.normalizedUrl,
    source,
    depth: 1,
    seed,
  };
}

test("SQLite frontier schedules five thousand requests durably", async () => {
  const root = await temporaryDirectory("site-crawler-v08-frontier-");
  const config = frontierConfig(root);
  const frontier = new Frontier("run_v08_sqlite_scale", config);
  await frontier.init();
  try {
    const seed = config.seeds[0];
    assert.notEqual(seed, undefined);
    const results = await frontier.enqueueMany(
      Array.from({ length: 5_000 }, (_, index) => enqueueInput(seed, index)),
    );
    assert.equal(
      results.every((result) => result.decision.status === "enqueued"),
      true,
    );
    assert.equal(frontier.size, 5_000);
    const lease = await frontier.leaseNext();
    assert.notEqual(lease, null);
    assert.equal(lease.request.normalizedUrl.endsWith("/page/0"), true);
    await frontier.markHandled(lease);
    await frontier.flush();
    assert.equal(
      (
        await fs.stat(path.join(root, "run_v08_sqlite_scale", "crawl.sqlite"))
      ).isFile(),
      true,
    );
  } finally {
    await frontier.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("frontier order supports breadth-first, depth-first, and priority modes", async () => {
  const cases = [
    { order: "bfs", expected: "/page/1" },
    { order: "dfs", expected: "/page/2" },
    { order: "priority", expected: "/page/2" },
  ];
  for (const entry of cases) {
    const config = resolveConfig({
      seeds: ["https://example.com/"],
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: {
        type: "memory",
        frontierBackend: "memory",
        frontierOrder: entry.order,
      },
    });
    const frontier = new Frontier(`run_${entry.order}`, config);
    await frontier.init();
    try {
      const seed = config.seeds[0];
      assert.notEqual(seed, undefined);
      await frontier.enqueue(enqueueInput(seed, 1, "hook"));
      await frontier.enqueue(enqueueInput(seed, 2, "seed"));
      const lease = await frontier.leaseNext();
      assert.notEqual(lease, null);
      assert.equal(lease.request.normalizedUrl.endsWith(entry.expected), true);
      await frontier.markHandled(lease);
    } finally {
      await frontier.close();
    }
  }
});
