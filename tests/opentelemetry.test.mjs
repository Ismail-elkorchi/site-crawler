import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpenTelemetryHooks } from "../dist/opentelemetry/public.js";

test("OpenTelemetry hooks translate crawl events without a runtime dependency", async () => {
  const counters = new Map();
  const histograms = new Map();
  const span = {
    attributes: new Map(),
    status: null,
    ended: false,
    setAttribute(name, value) {
      this.attributes.set(name, value);
      return this;
    },
    recordException() {},
    setStatus(status) {
      this.status = status;
      return this;
    },
    end() {
      this.ended = true;
    },
  };
  const hooks = createOpenTelemetryHooks({
    tracer: { startSpan: () => span },
    meter: {
      createCounter(name) {
        return {
          add: (value) => counters.set(name, (counters.get(name) ?? 0) + value),
        };
      },
      createHistogram(name) {
        return { record: (value) => histograms.set(name, value) };
      },
    },
  });
  const context = {};
  await hooks.onEvent(context, {
    type: "run-started",
    runId: "run-1",
    createdAt: new Date().toISOString(),
  });
  await hooks.onEvent(context, {
    type: "request-finished",
    runId: "run-1",
    requestId: "request-1",
    url: "https://example.com/",
    outcome: "fetched",
    createdAt: new Date().toISOString(),
  });
  await hooks.onEvent(context, {
    type: "render-finished",
    runId: "run-1",
    requestId: "request-1",
    url: "https://example.com/",
    success: true,
    durationMs: 42,
    createdAt: new Date().toISOString(),
  });
  await hooks.onEvent(context, {
    type: "run-finished",
    runId: "run-1",
    status: "completed",
    stopReason: "frontier_empty",
    stopDetail: { kind: "frontier-empty" },
    createdAt: new Date().toISOString(),
  });
  assert.equal(counters.get("site_crawler.requests"), 1);
  assert.equal(histograms.get("site_crawler.render.duration"), 42);
  assert.equal(span.attributes.get("site_crawler.status"), "completed");
  assert.equal(span.status.code, 1);
  assert.equal(span.ended, true);
});
