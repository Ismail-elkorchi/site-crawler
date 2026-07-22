import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/index.js";
import { Frontier } from "../dist/frontier/index.js";
import {
  FrontierJournal,
  FrontierJournalError,
} from "../dist/frontier/journal.js";
import { temporaryDirectory } from "./helpers.mjs";

function filesystemConfig(directory, resumeFrom = null) {
  return resolveConfig({
    seeds: ["https://example.com/"],
    storage: {
      type: "filesystem",
      directory,
      resumeFrom,
      durableFrontier: true,
      leaseDurationMs: 20,
      leaseRenewalIntervalMs: 5,
    },
  });
}

test("frontier recovers an abandoned lease as pending work", async () => {
  const root = await temporaryDirectory("site-crawler-frontier-");
  const runId = "run_frontier_recovery";
  const runDirectory = path.join(root, runId);
  await fs.mkdir(runDirectory, { recursive: true });
  const initial = new Frontier(runId, filesystemConfig(root));
  await initial.init();
  const seed = filesystemConfig(root).seeds[0];
  const enqueued = await initial.enqueue({
    rawUrl: "https://example.com/page",
    referrerUrl: null,
    source: "seed",
    depth: 0,
    seed,
  });
  assert.equal(enqueued.decision.status, "enqueued");
  const lease = await initial.leaseNext();
  assert.notEqual(lease, null);
  await initial.close();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const resumed = new Frontier(runId, filesystemConfig(root, runDirectory));
  const snapshot = await resumed.init();
  assert.equal(snapshot.resumedRequests, 1);
  assert.equal(snapshot.recoveredLeases, 1);
  assert.equal(resumed.size, 1);
  const recovered = await resumed.leaseNext();
  assert.equal(recovered.request.normalizedUrl, "https://example.com/page");
  await resumed.close();
});

test("frontier journal ignores only an incomplete final record", async () => {
  const root = await temporaryDirectory("site-crawler-journal-tail-");
  const file = path.join(root, "frontier.ndjson");
  const journal = new FrontierJournal(file, false);
  await journal.append({
    schemaId: "site-crawler.frontierJournal",
    schemaVersion: 1,
    type: "enqueued",
    request: requestFixture(),
    createdAt: new Date(0).toISOString(),
  });
  await journal.close();
  await fs.appendFile(file, '{"schemaId":"site-crawler.frontier', "utf8");
  const recovered = new FrontierJournal(file, false);
  assert.equal((await recovered.load()).length, 1);
  await recovered.close();
});

test("frontier journal rejects corruption before the final tail", async () => {
  const root = await temporaryDirectory("site-crawler-journal-corrupt-");
  const file = path.join(root, "frontier.ndjson");
  await fs.writeFile(file, '{"invalid":true}\n{"also":"invalid"}\n', "utf8");
  const journal = new FrontierJournal(file, false);
  await assert.rejects(async () => await journal.load(), FrontierJournalError);
});

function requestFixture() {
  const timestamp = new Date(0).toISOString();
  return {
    schemaId: "site-crawler.request",
    schemaVersion: 1,
    id: "req_fixture",
    uniqueKey: "https://example.com/#GET",
    rawUrl: "https://example.com/",
    resolvedUrl: "https://example.com/",
    normalizedUrl: "https://example.com/",
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
