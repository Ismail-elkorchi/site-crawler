import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { SiteCrawler } from "../dist/index.js";
import { resolveConfig } from "../dist/config/public.js";
import { crawlError } from "../dist/diagnostics/factory.js";
import { RuntimeFinalization } from "../dist/crawler/runtime-finalization.js";
import { zeroCounters } from "../dist/crawler/run-records.js";
import { RunController } from "../dist/runtime/run-controller.js";
import {
  crawlInput,
  readJson,
  readNdjson,
  temporaryDirectory,
} from "./helpers.mjs";

function successfulHttpClient(close = async () => {}) {
  return {
    async fetch(url) {
      return {
        statusCode: 200,
        finalUrl: url,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        body: new TextEncoder().encode(
          "<html><head><title>Fixture</title></head><body>Fixture</body></html>",
        ),
        redirects: [],
        responseTimeMs: 1,
        wireBytesRead: 76,
        decodedBytesRead: 76,
        remoteAddress: "127.0.0.1",
        error: null,
      };
    },
    close,
  };
}

test("run-finished is the final event and its manifest is already persisted", async () => {
  const root = await temporaryDirectory("site-crawler-terminal-event-");
  const observedManifests = [];
  const crawler = new SiteCrawler(
    crawlInput("http://127.0.0.1:43111", {
      storage: { type: "filesystem", directory: root },
    }),
    {
      httpClient: successfulHttpClient(),
      hooks: {
        async onEvent(context, event) {
          if (event.type !== "run-finished") return;
          const manifest = await readJson(
            path.join(root, context.runId, "manifest.json"),
          );
          observedManifests.push(manifest);
          assert.equal(manifest.status, event.status);
          assert.deepEqual(manifest.stopDetail, event.stopDetail);
        },
      },
    },
  );
  const subscription = crawler.events();
  const collected = [];
  const collecting = (async () => {
    for await (const event of subscription) collected.push(event);
  })();
  const result = await crawler.run();
  await collecting;
  assert.equal(observedManifests.length, 1);
  assert.equal(collected.at(-1)?.type, "run-finished");
  assert.equal(
    collected.filter((event) => event.type === "run-finished").length,
    1,
  );
  const manifest = await readJson(
    path.join(result.outputDirectory, "manifest.json"),
  );
  assert.equal(manifest.status, result.status);
});

test("aborting an active fetch terminalizes its lease as cancelled", async () => {
  const root = await temporaryDirectory("site-crawler-active-cancel-");
  let notifyStarted;
  const started = new Promise((resolve) => {
    notifyStarted = resolve;
  });
  const httpClient = {
    async fetch(url, options) {
      notifyStarted();
      await new Promise((resolve) => {
        if (options.signal?.aborted === true) resolve();
        else options.signal?.addEventListener("abort", resolve, { once: true });
      });
      return {
        statusCode: null,
        finalUrl: url,
        headers: new Headers(),
        body: null,
        redirects: [],
        responseTimeMs: 1,
        wireBytesRead: null,
        decodedBytesRead: null,
        remoteAddress: "127.0.0.1",
        error: crawlError({
          code: "FETCH_ABORTED",
          message: "Fixture fetch aborted",
          url,
          requestId: options.requestId,
        }),
      };
    },
  };
  const crawler = new SiteCrawler(
    crawlInput("http://127.0.0.1:43112", {
      storage: { type: "filesystem", directory: root },
    }),
    { httpClient },
  );
  const running = crawler.run();
  await started;
  crawler.abort("integration cancellation");
  const result = await running;
  assert.equal(result.status, "aborted");
  assert.equal(result.stats.requestsCancelled, 1);
  const states = await readNdjson(
    path.join(result.outputDirectory, "request-states.ndjson"),
  );
  const cancelled = states.find((state) => state.state === "cancelled");
  assert.notEqual(cancelled, undefined);
  assert.match(cancelled.reason, /integration cancellation/u);
});

test("HTTP client and renderer close failures change the final run status", async () => {
  const renderer = {
    name: "failing-renderer",
    version: "test",
    async render(request) {
      return {
        requestedUrl: request.url,
        finalUrl: request.url,
        html: "<html><head><title>Rendered</title></head><body></body></html>",
        renderedAt: new Date().toISOString(),
        durationMs: 1,
        cookies: [],
        warnings: [],
      };
    },
    async close() {
      throw new Error("renderer close failed");
    },
  };
  const httpClient = successfulHttpClient(async () => {
    throw new Error("http close failed");
  });
  const result = await new SiteCrawler(
    crawlInput("http://127.0.0.1:43113", {
      rendering: { mode: "always", maxRenderedPages: 1 },
    }),
    { httpClient, renderer },
  ).run();
  assert.equal(result.status, "failed");
  assert.equal(result.fatalError?.code, "INTERNAL_ERROR");
  assert.match(result.fatalError?.causeMessage ?? "", /shutdown failed/u);
});

test("frontier auxiliary close failure changes finalization to failed", async () => {
  const harness = finalizationHarness({ auxiliaryFailure: true });
  const result = await harness.finalization.finalize(true);
  assert.equal(result.status, "failed");
  assert.equal(harness.terminalEvents.at(-1)?.status, "failed");
  assert.equal(harness.controller.phase, "closed");
});

test("result store close failure changes finalization to failed", async () => {
  const harness = finalizationHarness({ storeFailure: true });
  const result = await harness.finalization.finalize(true);
  assert.equal(result.status, "failed");
  assert.equal(harness.terminalEvents.at(-1)?.status, "failed");
  assert.equal(harness.persistedStatuses.at(-1), "failed");
});

function finalizationHarness({
  auxiliaryFailure = false,
  storeFailure = false,
}) {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    robots: { enabled: false },
    sitemaps: { enabled: false },
    storage: { type: "memory" },
  });
  const counters = zeroCounters();
  const controller = new RunController(config, counters);
  controller.beginInitialization();
  controller.beginRunning();
  controller.completeFrontier();
  const terminalEvents = [];
  const persistedStatuses = [];
  const resultFor = (fatalError) => ({
    schemaId: "site-crawler.result",
    schemaVersion: 1,
    runId: "run_finalization_fixture",
    status: fatalError === null ? "completed" : "failed",
    stopReason: fatalError === null ? "frontier_empty" : "fatal_error",
    stopDetail: controller.stopDetail,
    outputDirectory: null,
    manifestPath: null,
    stats: {
      schemaId: "site-crawler.stats",
      schemaVersion: 1,
      runId: "run_finalization_fixture",
      startedAt: new Date(0).toISOString(),
      finishedAt: new Date(1).toISOString(),
    },
    fatalError,
  });
  const runtime = {
    runId: "run_finalization_fixture",
    controller,
    extensions: { hooks: {} },
    extensionRunner: {
      async invoke(_name, _scope, operation) {
        return await operation();
      },
    },
    dispatcher: {
      async drain() {},
      emit() {},
      async prepareTerminal() {},
      emitTerminal(event) {
        terminalEvents.push(event);
      },
      close() {},
    },
    finalizer: {
      result: resultFor,
      async closeAuxiliary() {
        if (auxiliaryFailure) throw new Error("frontier close failed");
      },
      async persist(result) {
        persistedStatuses.push(result.status);
      },
      async persistMetadata(result) {
        persistedStatuses.push(result.status);
      },
    },
    store: {
      async writeError() {},
      async close() {
        if (storeFailure) throw new Error("store close failed");
      },
    },
  };
  return {
    controller,
    terminalEvents,
    persistedStatuses,
    finalization: new RuntimeFinalization(runtime, () => ({
      runId: runtime.runId,
    })),
  };
}
