import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/index.js";
import { Frontier } from "../dist/frontier/index.js";
import { FrontierJournal } from "../dist/frontier/journal.js";
import { temporaryDirectory } from "./helpers.mjs";

function memoryConfig(overrides = {}) {
  return resolveConfig({
    seeds: ["https://example.com/"],
    limits: { maxQueueSize: 10_000, ...overrides.limits },
    storage: {
      type: "memory",
      leaseDurationMs: 10_000,
      leaseRenewalIntervalMs: 2_000,
      ...overrides.storage,
    },
  });
}

function filesystemConfig(directory, resumeFrom = null, overrides = {}) {
  return resolveConfig({
    seeds: ["https://example.com/"],
    limits: { maxQueueSize: 10_000, ...overrides.limits },
    storage: {
      type: "filesystem",
      directory,
      resumeFrom,
      durableFrontier: true,
      leaseDurationMs: 10_000,
      leaseRenewalIntervalMs: 2_000,
      lockHeartbeatMs: 50,
      staleLockMs: 5_000,
      ...overrides.storage,
    },
  });
}

test("frontier journal serializes ten thousand concurrent appends", async () => {
  const root = await temporaryDirectory("site-crawler-journal-concurrent-");
  const file = path.join(root, "frontier.ndjson");
  const journal = new FrontierJournal(file, false);
  const timestamp = new Date(0).toISOString();
  await Promise.all(
    Array.from({ length: 10_000 }, (_, index) =>
      journal.append({
        schemaId: "site-crawler.frontierJournal",
        schemaVersion: 1,
        type: "enqueued",
        request: requestFixture(index),
        createdAt: timestamp,
      }),
    ),
  );
  await journal.close();
  const loaded = new FrontierJournal(file, false);
  const records = await loaded.load();
  assert.equal(records.length, 10_000);
  for (let index = 0; index < records.length; index += 1) {
    assert.equal(records[index].sequence, index + 1);
  }
  await loaded.close();
});

test("concurrent duplicate enqueue creates one request identity", async () => {
  const config = memoryConfig({ limits: { maxQueueSize: 1 } });
  const frontier = new Frontier("run_duplicate_atomic", config);
  await frontier.init();
  const seed = config.seeds[0];
  const results = await Promise.all(
    Array.from({ length: 100 }, () =>
      frontier.enqueue({
        rawUrl: "https://example.com/same",
        referrerUrl: "https://example.com/",
        source: "html-link",
        depth: 1,
        seed,
      }),
    ),
  );
  assert.equal(
    results.filter((result) => result.decision.status === "enqueued").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.decision.status === "already_seen")
      .length,
    99,
  );
  assert.equal(frontier.size, 1);
  await frontier.close();
});

test("terminal request transitions reject stale leases and duplicates", async () => {
  const config = memoryConfig();
  const frontier = new Frontier("run_terminal_transition", config);
  await frontier.init();
  const enqueued = await frontier.enqueue({
    rawUrl: "https://example.com/page",
    referrerUrl: null,
    source: "seed",
    depth: 0,
    seed: config.seeds[0],
  });
  assert.equal(enqueued.decision.status, "enqueued");
  const lease = await frontier.leaseNext();
  assert.notEqual(lease, null);
  await frontier.markHandled(lease);
  await assert.rejects(
    async () => await frontier.markFailed(lease, "late failure"),
    /stale lease/u,
  );
  await assert.rejects(
    async () => await frontier.renewLease(lease),
    /stale lease/u,
  );
  await frontier.close();
});

test("resume defers an unexpired lease instead of duplicating ownership", async () => {
  const root = await temporaryDirectory("site-crawler-deferred-lease-");
  const runId = "run_deferred_lease";
  const runDirectory = path.join(root, runId);
  await fs.mkdir(runDirectory, { recursive: true });
  const initialConfig = filesystemConfig(root);
  const initial = new Frontier(runId, initialConfig);
  await initial.init();
  await initial.enqueue({
    rawUrl: "https://example.com/page",
    referrerUrl: null,
    source: "seed",
    depth: 0,
    seed: initialConfig.seeds[0],
  });
  const lease = await initial.leaseNext();
  assert.notEqual(lease, null);
  await initial.close();

  const resumed = new Frontier(runId, filesystemConfig(root, runDirectory));
  const snapshot = await resumed.init();
  assert.equal(snapshot.recoveredLeases, 0);
  assert.equal(snapshot.deferredLeases, 1);
  assert.equal(await resumed.leaseNext(), null);
  assert.equal(resumed.nextDeferredAt() > Date.now(), true);
  await resumed.close();
});

test("run directory ownership is exclusive", async () => {
  const root = await temporaryDirectory("site-crawler-run-lock-");
  const runId = "run_lock_exclusive";
  const config = filesystemConfig(root);
  const first = new Frontier(runId, config);
  const second = new Frontier(runId, config);
  await first.init();
  await assert.rejects(async () => await second.init(), /already owned/u);
  await first.close();
  await second.init();
  await second.close();
});

function requestFixture(index) {
  const timestamp = new Date(0).toISOString();
  const url = `https://example.com/${index}`;
  return {
    schemaId: "site-crawler.request",
    schemaVersion: 1,
    id: `req_${index}`,
    uniqueKey: `${url}#GET`,
    rawUrl: url,
    resolvedUrl: url,
    normalizedUrl: url,
    referrerUrl: null,
    source: "seed",
    seedUrl: "https://example.com/",
    seedLabel: null,
    depth: 0,
    sitemapIndexDepth: 0,
    sitemapAncestors: [],
    priority: 100,
    method: "GET",
    headers: {},
    renderPolicy: "never",
    retryCount: 0,
    maxRetries: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    userData: {},
  };
}
