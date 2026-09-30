import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConfig, SiteCrawler } from "../dist/index.js";
import { zeroCounters } from "../dist/crawler/run-records.js";
import { crawlError } from "../dist/diagnostics/factory.js";
import { RunController } from "../dist/runtime/run-controller.js";
import { closeServer, crawlInput, listen } from "./helpers.mjs";

const softLimits = [
  "max-scheduled-requests",
  "max-queue-size",
  "max-sitemap-files",
  "max-sitemap-entries",
  "max-sitemap-index-depth",
  "max-rendered-pages",
];
const hardLimits = [
  "max-fetched-resources",
  "max-run-time",
  "max-downloaded-bytes",
];

for (const soft of softLimits) {
  for (const hard of hardLimits) {
    test(`${hard} takes precedence over ${soft} in either order`, () => {
      for (const limits of [
        [soft, hard],
        [hard, soft],
      ]) {
        const controller = createController();
        controller.noteLimit(limits[0]);
        assert.equal(controller.shouldLeaseMore(), limits[0] === soft);
        controller.noteLimit(limits[1]);
        assert.deepEqual(controller.stopDetail, { kind: "limit", limit: hard });
        assert.equal(controller.stopReason(), "limit_reached");
        assert.equal(controller.shouldLeaseMore(), false);
        assert.equal(controller.cancellationSignal.aborted, false);
        assert.equal(controller.phase, "stopping");
      }
    });
  }
}

test("cancellation takes precedence over every limit in either order", () => {
  for (const limit of [...softLimits, ...hardLimits]) {
    for (const cancelFirst of [false, true]) {
      const controller = createController();
      if (cancelFirst) controller.cancel("user cancelled");
      controller.noteLimit(limit);
      if (!cancelFirst) controller.cancel("user cancelled");
      assert.deepEqual(controller.stopDetail, {
        kind: "cancelled",
        reason: "user cancelled",
      });
      assert.equal(controller.stopReason(), "aborted");
      assert.equal(controller.shouldLeaseMore(), false);
      assert.equal(controller.cancellationSignal.aborted, true);
      assert.deepEqual(
        controller.cancellationSignal.reason,
        controller.stopDetail,
      );
    }
  }
});

test("fatal errors take precedence over cancellation and every limit", () => {
  const error = fatalError("primary failure");
  for (const limit of [...softLimits, ...hardLimits]) {
    for (const failFirst of [false, true]) {
      const controller = createController();
      if (failFirst) controller.fail(error);
      controller.noteLimit(limit);
      controller.cancel("user cancelled");
      if (!failFirst) controller.fail(error);
      assert.deepEqual(controller.stopDetail, { kind: "fatal", error });
      assert.equal(controller.fatalError, error);
      assert.equal(controller.stopReason(), "fatal_error");
      assert.equal(controller.shouldLeaseMore(), false);
      assert.equal(controller.cancellationSignal.aborted, true);
      assert.equal(
        controller.cancellationSignal.reason.kind,
        failFirst ? "fatal" : "cancelled",
      );
    }
  }
});

test("frontier completion never masks a limit, cancellation, or fatal error", () => {
  const error = fatalError("finalization failure");
  const stops = [
    ...[...softLimits, ...hardLimits].map((limit) => ({
      kind: "limit",
      limit,
    })),
    { kind: "cancelled", reason: "user cancelled" },
    { kind: "fatal", error },
  ];
  for (const stop of stops) {
    for (const completeFirst of [false, true]) {
      const controller = createController();
      if (completeFirst) controller.completeFrontier();
      if (stop.kind === "limit") controller.noteLimit(stop.limit);
      else if (stop.kind === "cancelled") controller.cancel(stop.reason);
      else controller.fail(stop.error);
      controller.completeFrontier();
      assert.deepEqual(controller.stopDetail, stop);
    }
  }
});

test("non-fatal stops with equal priority retain the first reason", () => {
  for (const limits of [softLimits, hardLimits]) {
    const controller = createController();
    for (const limit of limits) controller.noteLimit(limit);
    assert.deepEqual(controller.stopDetail, {
      kind: "limit",
      limit: limits[0],
    });
  }

  const cancelled = createController();
  cancelled.cancel("first cancellation");
  cancelled.cancel("second cancellation");
  assert.equal(cancelled.stopDetail.reason, "first cancellation");
  assert.deepEqual(cancelled.cancellationSignal.reason, cancelled.stopDetail);
});

test("later fatal errors update the final failure without re-aborting requests", () => {
  const failed = createController();
  const first = fatalError("first failure");
  const second = fatalError("second failure");
  failed.fail(first);
  failed.fail(second);
  assert.equal(failed.fatalError, second);
  assert.deepEqual(failed.cancellationSignal.reason, {
    kind: "fatal",
    error: first,
  });
});

test("refreshing fetched and downloaded limits promotes an earlier soft stop", () => {
  for (const [limits, expected] of [
    [{ maxFetchedResources: 1 }, "max-fetched-resources"],
    [{ maxDownloadedBytes: 1 }, "max-downloaded-bytes"],
  ]) {
    const controller = createController(limits);
    controller.noteLimit("max-scheduled-requests");
    controller.recordFetched(1, 1);
    assert.deepEqual(controller.stopDetail, { kind: "limit", limit: expected });
    assert.equal(controller.shouldLeaseMore(), false);
    assert.equal(controller.cancellationSignal.aborted, false);
  }
});

test("lease checks promote a soft stop when the run-time limit expires", (context) => {
  let now = 100;
  context.mock.method(performance, "now", () => now);
  const controller = createController({ maxRunTimeMs: 10 });
  controller.noteLimit("max-queue-size");
  assert.equal(controller.shouldLeaseMore(), true);
  now += 10;
  assert.equal(controller.shouldLeaseMore(), false);
  assert.deepEqual(controller.stopDetail, {
    kind: "limit",
    limit: "max-run-time",
  });
  assert.equal(controller.cancellationSignal.aborted, false);
});

test("each limit is reported once even when a higher-priority stop exists", () => {
  const controller = createController();
  const reported = [];
  controller.observeLimits((limit) => reported.push(limit));
  controller.cancel("user cancelled");
  for (const limit of [...softLimits, ...hardLimits]) {
    controller.noteLimit(limit);
    controller.noteLimit(limit);
  }
  assert.deepEqual(reported, [...softLimits, ...hardLimits]);
  assert.equal(controller.stopReason(), "aborted");
});

test("a scheduling cap cannot allow queued work past the fetched-resource limit", async () => {
  const requested = [];
  const fixture = await listen((request, response) => {
    requested.push(request.url);
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      request.url === "/"
        ? '<a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>'
        : "<html><body>boundary response</body></html>",
    );
  });
  try {
    const result = await new SiteCrawler(
      crawlInput(fixture.origin, {
        limits: { maxScheduledRequests: 3, maxFetchedResources: 2 },
        network: { maxConcurrency: 1 },
      }),
    ).run();
    assert.equal(result.status, "stopped_by_limit");
    assert.deepEqual(result.stopDetail, {
      kind: "limit",
      limit: "max-fetched-resources",
    });
    assert.equal(result.stats.requestsScheduled, 3);
    assert.equal(result.stats.requestsFetched, 2);
    assert.equal(result.stats.htmlPagesParsed, 2);
    assert.equal(result.stats.requestsCancelled, 0);
    assert.deepEqual(requested, ["/", "/a"]);
  } finally {
    await closeServer(fixture.server);
  }
});

function createController(limits = {}) {
  const controller = new RunController(
    resolveConfig({
      seeds: ["https://example.com/"],
      limits,
      storage: { type: "memory" },
    }),
    zeroCounters(),
  );
  controller.beginInitialization();
  controller.beginRunning();
  return controller;
}

function fatalError(message) {
  return crawlError({ code: "INTERNAL_ERROR", message, fatal: true });
}
