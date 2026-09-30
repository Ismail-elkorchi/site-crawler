import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/index.js";
import { RequestScheduler } from "../dist/crawler/request-scheduler.js";
import { zeroCounters } from "../dist/crawler/run-records.js";
import { Frontier } from "../dist/frontier/index.js";
import { ScopePolicy } from "../dist/url/index.js";

async function fixture(t, hooks = {}, overrides = {}) {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    storage: { type: "memory" },
    ...overrides,
  });
  const frontier = new Frontier("admission-test", config);
  await frontier.init();
  t.after(() => frontier.close());
  const counters = zeroCounters();
  const writes = [];
  const store = Object.fromEntries(
    ["writeDiscovery", "writeRequest", "writeRequestState", "writeSkipped"].map(
      (name) => [
        name,
        async (value) => {
          writes.push({ name, value });
        },
      ],
    ),
  );
  let scheduler;
  scheduler = new RequestScheduler({
    runId: "admission-test",
    config,
    counters,
    frontier,
    store,
    scope: new ScopePolicy(config.scope, config.seeds),
    robots: {},
    extensions: { hooks },
    extensionRunner: {
      async invoke(_name, _metadata, action) {
        await action();
      },
    },
    context: () => ({ enqueue: (url) => enqueue(url) }),
    emit() {},
    onLimit() {},
  });
  const enqueue = (url, source = "html-link") =>
    scheduler.enqueue(url, null, source, 0, config.seeds[0]);
  return { scheduler, enqueue, frontier, counters, writes, store };
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("admission hook deadlocked")),
          500,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test("enqueue hook can await another enqueue after accounting and reservations commit", async (t) => {
  let nested;
  const f = await fixture(t, {
    async onRequestEnqueued(context, request) {
      if (request.normalizedUrl.endsWith("/first"))
        nested = await context.enqueue("https://example.com/second");
    },
  });
  assert.equal(
    (await bounded(f.enqueue("https://example.com/first"))).status,
    "enqueued",
  );
  assert.equal(nested.status, "enqueued");
  assert.equal(f.counters.requestsScheduled, 2);
});

test("skip hook can await another enqueue without holding admission lock", async (t) => {
  let nested;
  const f = await fixture(t, {
    async onRequestSkipped(context) {
      nested = await context.enqueue("https://example.com/allowed");
    },
  });
  assert.equal(
    (await bounded(f.enqueue("https://outside.example/rejected"))).status,
    "rejected_scope",
  );
  assert.equal(nested.status, "enqueued");
});

for (const [name, overrides, source, expected] of [
  [
    "global quota",
    { limits: { maxScheduledRequests: 2 } },
    "html-link",
    "queue_limit",
  ],
  [
    "seed quota",
    { seeds: [{ url: "https://example.com/", maxScheduledRequests: 2 }] },
    "html-link",
    "queue_limit",
  ],
  [
    "directory reservation",
    { scope: { maxUrlsPerDirectory: 2 } },
    "html-link",
    "trap_guard",
  ],
  [
    "sitemap quota",
    { sitemaps: { maxSitemapFiles: 2 } },
    "robots-sitemap",
    "trap_guard",
  ],
]) {
  test(`concurrent admission preserves ${name}`, async (t) => {
    const f = await fixture(t, {}, overrides);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        f.enqueue(`https://example.com/item-${i}`, source),
      ),
    );
    assert.equal(results.filter((x) => x.status === "enqueued").length, 2);
    assert.equal(results.filter((x) => x.status === expected).length, 18);
    assert.equal(f.counters.requestsScheduled, 2);
    assert.equal(f.frontier.size, 2);
  });
}

test("duplicate admission records discovery but consumes no additional quota", async (t) => {
  const f = await fixture(t, {}, { limits: { maxScheduledRequests: 1 } });
  const results = await Promise.all(
    Array.from({ length: 20 }, () => f.enqueue("https://example.com/same")),
  );
  assert.equal(results.filter((x) => x.status === "enqueued").length, 1);
  assert.equal(results.filter((x) => x.status === "already_seen").length, 19);
  assert.equal(f.counters.requestsScheduled, 1);
  assert.equal(f.writes.filter((x) => x.name === "writeDiscovery").length, 20);
});

test("hook failure retains committed request accounting and reservations", async (t) => {
  const f = await fixture(
    t,
    {
      onRequestEnqueued() {
        throw new Error("hook failure");
      },
    },
    { scope: { maxUrlsPerDirectory: 1 } },
  );
  await assert.rejects(f.enqueue("https://example.com/first"), /hook failure/);
  assert.equal(f.counters.requestsScheduled, 1);
  assert.equal(
    (await f.enqueue("https://example.com/second")).status,
    "trap_guard",
  );
  assert.equal(
    (await f.enqueue("https://example.com/first")).status,
    "already_seen",
  );
});

test("persistence failure suppresses notification and releases admission lock", async (t) => {
  let notifications = 0;
  const f = await fixture(t, {
    onRequestEnqueued() {
      notifications += 1;
    },
  });
  const original = f.store.writeRequest;
  f.store.writeRequest = async () => {
    throw new Error("storage failure");
  };
  await assert.rejects(
    f.enqueue("https://example.com/first"),
    /storage failure/,
  );
  assert.equal(notifications, 0);
  f.store.writeRequest = original;
  assert.equal(
    (await bounded(f.enqueue("https://example.com/second"))).status,
    "enqueued",
  );
  assert.equal(notifications, 1);
});

test("restored admission reconstructs seed quotas", async (t) => {
  const f = await fixture(
    t,
    {},
    { seeds: [{ url: "https://example.com/", maxScheduledRequests: 1 }] },
  );
  await f.frontier.enqueue({
    rawUrl: "https://example.com/existing",
    referrerUrl: null,
    source: "seed",
    depth: 0,
    seed: resolveConfig({
      seeds: [{ url: "https://example.com/", maxScheduledRequests: 1 }],
    }).seeds[0],
  });
  f.scheduler.restoreAccounting();
  assert.equal(
    (await f.enqueue("https://example.com/new")).status,
    "queue_limit",
  );
});

test("reentrant enqueue sees committed directory reservation", async (t) => {
  let nested;
  const f = await fixture(
    t,
    {
      async onRequestEnqueued(context) {
        nested = await context.enqueue("https://example.com/second");
      },
    },
    { scope: { maxUrlsPerDirectory: 1 } },
  );
  assert.equal(
    (await bounded(f.enqueue("https://example.com/first"))).status,
    "enqueued",
  );
  assert.equal(nested.status, "trap_guard");
  assert.equal(f.counters.requestsScheduled, 1);
});

test("frontier-produced invalid URL skips can reenter admission", async (t) => {
  let nested;
  const f = await fixture(t, {
    async onRequestSkipped(context) {
      nested = await context.enqueue("https://example.com/valid");
    },
  });
  assert.notEqual((await bounded(f.enqueue("not a URL"))).status, "enqueued");
  assert.equal(nested.status, "enqueued");
});

test("concurrent admission preserves path-pattern reservations", async (t) => {
  const f = await fixture(t, {}, { scope: { maxUrlsPerPathPattern: 2 } });
  const decisions = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      f.enqueue(`https://example.com/items/${i}`),
    ),
  );
  assert.equal(decisions.filter((x) => x.status === "enqueued").length, 2);
  assert.equal(decisions.filter((x) => x.status === "trap_guard").length, 18);
});

test("restored admission reconstructs directory reservations", async (t) => {
  const f = await fixture(t, {}, { scope: { maxUrlsPerDirectory: 1 } });
  await f.frontier.enqueue({
    rawUrl: "https://example.com/existing",
    referrerUrl: null,
    source: "seed",
    depth: 0,
    seed: resolveConfig({ seeds: ["https://example.com/"] }).seeds[0],
  });
  f.scheduler.restoreAccounting();
  assert.equal(
    (await f.enqueue("https://example.com/new")).status,
    "trap_guard",
  );
});
