import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { SiteCrawler } from "../dist/index.js";
import {
  runtimeContracts,
  validateContract,
} from "../dist/contracts/public.js";
import { compareRuns } from "../dist/diff/public.js";
import { createEvidenceBundle } from "../dist/evidence/public.js";
import { inspectRun, validateRun } from "../dist/operations/public.js";
import { replayRun } from "../dist/replay/public.js";
import { auditRunSecurity } from "../dist/security/public.js";
import { SqliteWorkerCoordinator } from "../dist/workers/public.js";
import {
  closeServer,
  crawlInput,
  listen,
  readJson,
  temporaryDirectory,
} from "./helpers.mjs";

async function crawlVersioned(origin, root, title) {
  return await new SiteCrawler(
    crawlInput(origin, {
      storage: {
        type: "sqlite",
        directory: root,
        frontierBackend: "sqlite",
        storeRawHtml: true,
        storeRawXml: true,
        writeNdjsonExports: true,
      },
      sitemaps: { enabled: false },
    }),
  ).run();
}

test("runtime contracts validate current persistent records", async () => {
  assert.equal(runtimeContracts.length >= 30, true);
  const value = {
    schemaId: "site-crawler.evidenceReference",
    schemaVersion: 1,
    algorithm: "sha256",
    digest: "0".repeat(64),
    kind: "html",
    mediaType: "text/html",
    relativePath: `evidence/sha256/${"0".repeat(64)}`,
    createdAt: new Date(0).toISOString(),
    byteLength: 0,
    capture: { kind: "complete", sourceByteLength: 0 },
  };
  assert.deepEqual(validateContract("evidence-reference", value), value);
});

test("content-addressed evidence bundles deduplicate and replay deterministically", async () => {
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(
      "<html><head><title>Replay</title></head><body>same</body></html>",
    );
  });
  const root = await temporaryDirectory("site-crawler-v09-replay-");
  try {
    const result = await crawlVersioned(fixture.origin, root);
    const replay = await replayRun(result.outputDirectory);
    assert.equal(replay.failed, 0);
    assert.equal(replay.changed, 0);
    assert.equal(replay.matched > 0, true);
    const bundle = await createEvidenceBundle(result.outputDirectory, {
      compressObjects: true,
    });
    assert.equal(bundle.objectCount > 0, true);
    assert.equal(bundle.storedBytes > 0, true);
    assert.equal(
      bundle.files.every(
        (file) =>
          file.contentEncoding === "gzip" ||
          !file.sourcePath.startsWith("evidence/"),
      ),
      true,
    );
  } finally {
    await closeServer(fixture.server);
  }
});

test("differential crawling reports factual page changes", async () => {
  let title = "Before";
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(
      `<html><head><title>${title}</title></head><body>${title}</body></html>`,
    );
  });
  const baseRoot = await temporaryDirectory("site-crawler-v09-diff-base-");
  const targetRoot = await temporaryDirectory("site-crawler-v09-diff-target-");
  try {
    const base = await crawlVersioned(fixture.origin, baseRoot);
    title = "After";
    const target = await crawlVersioned(fixture.origin, targetRoot);
    const report = await compareRuns(
      base.outputDirectory,
      target.outputDirectory,
    );
    assert.equal(
      report.changes.some((change) => change.kind === "title-changed"),
      true,
    );
    assert.equal(
      report.changes.some((change) => change.kind === "text-changed"),
      true,
    );
  } finally {
    await closeServer(fixture.server);
  }
});

test("SQLite worker coordinators enforce cross-process origin ownership", async () => {
  const directory = await temporaryDirectory("site-crawler-v09-workers-");
  const first = new SqliteWorkerCoordinator(directory);
  const second = new SqliteWorkerCoordinator(directory);
  try {
    first.register("worker-a", "run-a");
    second.register("worker-b", "run-a");
    const options = {
      maxConcurrency: 1,
      minDelayMs: 0,
      leaseDurationMs: 5_000,
    };
    const permit = first.acquireOrigin(
      "https://example.com",
      "worker-a",
      options,
    );
    assert.notEqual(permit, null);
    assert.equal(
      second.acquireOrigin("https://example.com", "worker-b", options),
      null,
    );
    first.releaseOrigin(permit);
    assert.notEqual(
      second.acquireOrigin("https://example.com", "worker-b", options),
      null,
    );
  } finally {
    first.close();
    second.close();
  }
});

test("run inspection, validation, and security audit agree on a valid run", async () => {
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(
      "<html><head><title>Inspect</title></head><body>ok</body></html>",
    );
  });
  const root = await temporaryDirectory("site-crawler-v09-ops-");
  try {
    const result = await crawlVersioned(fixture.origin, root);
    const inspection = await inspectRun(result.outputDirectory);
    const validation = await validateRun(result.outputDirectory);
    const security = await auditRunSecurity(result.outputDirectory);
    assert.equal(inspection.runId, result.runId);
    assert.equal(validation.valid, true);
    assert.notEqual(security.status, "failed");
  } finally {
    await closeServer(fixture.server);
  }
});
