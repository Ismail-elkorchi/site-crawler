import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PlaywrightOperationTimeoutError,
  withPlaywrightTimeout,
} from "../dist/rendering/playwright/timeout.js";

test("Playwright operation deadlines preserve successful results", async () => {
  const value = await withPlaywrightTimeout(
    Promise.resolve("complete"),
    "fixture operation",
    100,
  );
  assert.equal(value, "complete");
});

test("Playwright operation deadlines reject stalled operations", async () => {
  let timedOut = false;
  const stalled = new Promise(() => undefined);
  await assert.rejects(
    withPlaywrightTimeout(stalled, "stalled fixture", 10, () => {
      timedOut = true;
    }),
    (error) => {
      assert.ok(error instanceof PlaywrightOperationTimeoutError);
      assert.equal(error.operation, "stalled fixture");
      assert.equal(error.timeoutMs, 10);
      return true;
    },
  );
  assert.equal(timedOut, true);
});
