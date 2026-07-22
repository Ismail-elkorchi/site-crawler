import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { SiteCrawler } from "../dist/index.js";

const collectGarbage = globalThis.gc;
if (typeof collectGarbage !== "function") {
  throw new Error("Resource-leak verification requires --expose-gc.");
}

const initialResources = resourceCounts();
let report = null;
const spoolDirectory = await fs.mkdtemp(
  path.join(os.tmpdir(), "site-crawler-leak-spool-"),
);
const server = http.createServer((_request, response) => {
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(
    `<html><body>${"payload ".repeat(512)}<a href="/one">one</a><a href="/two">two</a></body></html>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.notEqual(address, null);
assert.equal(typeof address, "object");
const origin = `http://127.0.0.1:${address.port}`;

try {
  await settle();
  const runningBaseline = resourceCounts();
  let heapBaseline = 0;
  const warmupRuns = 5;
  const measuredRuns = 20;
  for (
    let iteration = 0;
    iteration < warmupRuns + measuredRuns;
    iteration += 1
  ) {
    const result = await new SiteCrawler({
      seeds: [`${origin}/`],
      limits: { maxScheduledRequests: 3, maxFetchedResources: 3 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      responseLimits: {
        memoryThresholdBytes: 64,
        spoolDirectory,
      },
      storage: { type: "memory" },
    }).run();
    assert.notEqual(result.status, "failed");
    assert.deepEqual(await fs.readdir(spoolDirectory), []);
    collectGarbage();
    if (iteration === warmupRuns - 1) {
      heapBaseline = process.memoryUsage().heapUsed;
    }
  }

  await settle();
  collectGarbage();
  const heapFinal = process.memoryUsage().heapUsed;
  const allowedGrowth = Math.max(16 * 1024 * 1024, heapBaseline * 0.35);
  assert.equal(
    heapFinal - heapBaseline <= allowedGrowth,
    true,
    `Heap grew by ${heapFinal - heapBaseline} bytes after warmup; limit ${allowedGrowth}.`,
  );
  assertNoResourceGrowth(runningBaseline, resourceCounts());
  report = {
    schemaId: "site-crawler.resourceLeakCheck",
    schemaVersion: 1,
    warmupRuns,
    measuredRuns,
    heapBaseline,
    heapFinal,
  };
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
  await fs.rm(spoolDirectory, { recursive: true, force: true });
}

await settle();
assertNoResourceGrowth(initialResources, resourceCounts());
assert.notEqual(report, null);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function resourceCounts() {
  const counts = new Map();
  for (const resource of process.getActiveResourcesInfo()) {
    counts.set(resource, (counts.get(resource) ?? 0) + 1);
  }
  return counts;
}

function assertNoResourceGrowth(before, after) {
  for (const resource of [
    "ChildProcess",
    "FSReqPromise",
    "FileHandleCloseReq",
    "PipeWrap",
    "TCPConnectWrap",
    "TCPServerWrap",
    "TCPSocketWrap",
    "Timeout",
  ]) {
    assert.equal(
      (after.get(resource) ?? 0) <= (before.get(resource) ?? 0),
      true,
      `${resource} resources grew from ${before.get(resource) ?? 0} to ${after.get(resource) ?? 0}.`,
    );
  }
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
