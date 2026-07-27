import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/index.js";
import { PolitenessController } from "../dist/politeness/index.js";

test("adaptive throttling increases delay after latency and errors", () => {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    network: {
      maxConcurrencyPerOrigin: 1,
      autoThrottle: {
        enabled: true,
        targetConcurrencyPerOrigin: 1,
        startDelayMs: 100,
        minDelayMs: 0,
        maxDelayMs: 5_000,
        smoothing: 1,
      },
    },
    robots: { enabled: false },
    sitemaps: { enabled: false },
    storage: { type: "memory" },
  });
  const controller = new PolitenessController(config);
  const request = { normalizedUrl: "https://example.com/page" };
  assert.equal(controller.tryReserve(request), true);
  controller.release("https://example.com", {
    kind: "fetched",
    statusCode: 200,
    responseTimeMs: 1_100,
    latencyMs: 1_000,
  });
  assert.equal(controller.stats()[0].currentDelayMs, 1_000);
  assert.equal(controller.tryReserve(request), false);
  controller.releaseReservation(request);
  controller.release("https://example.com", {
    kind: "transport-failed",
    statusCode: null,
    responseTimeMs: 10,
    latencyMs: 10,
  });
  assert.equal(controller.stats()[0].currentDelayMs, 2_000);
});
