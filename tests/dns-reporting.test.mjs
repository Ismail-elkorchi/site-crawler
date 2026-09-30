import assert from "node:assert/strict";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { collectResponseBody } from "@ismail-elkorchi/http-client";
import { SiteCrawler } from "../dist/index.js";
import { crawlError } from "../dist/diagnostics/factory.js";
import {
  closeServer,
  listen,
  readJson,
  readNdjson,
  temporaryDirectory,
} from "./helpers.mjs";

const publicAddress = [{ address: "93.184.216.34", family: 4 }];

async function fixture(
  t,
  {
    seeds = ["https://dns.example/"],
    network = {},
    networkSafety = {},
    extensions = {},
  } = {},
) {
  const root = await temporaryDirectory("site-crawler-dns-");
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let fetches = 0;
  let closes = 0;
  const events = [];
  const failures = [];
  const body = new TextEncoder().encode(
    "<html><head><title>Resolved</title></head><body>Fixture</body></html>",
  );
  const crawler = new SiteCrawler(
    {
      seeds,
      network: { retries: 2, retryBackoffMs: 5, maxConcurrency: 1, ...network },
      networkSafety,
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: { type: "filesystem", directory: root },
    },
    {
      httpClient: {
        async fetch(url) {
          fetches += 1;
          return {
            statusCode: 200,
            finalUrl: url,
            headers: new Headers({ "content-type": "text/html" }),
            body: await collectResponseBody(new Response(body).body, {
              maxBytes: body.byteLength,
              storage: {
                memoryThresholdBytes: body.byteLength,
                spoolDirectory: null,
              },
            }),
            redirects: [],
            responseTimeMs: 1,
            wireBytesRead: body.byteLength,
            decodedBytesRead: body.byteLength,
            remoteAddress: "93.184.216.34",
            protocol: "http/1.1",
            timings: null,
            tls: null,
            cacheStatus: "miss",
            error: null,
          };
        },
        async close() {
          closes += 1;
        },
      },
      hooks: {
        onRequestFailed(_context, error) {
          failures.push(error);
        },
      },
      ...extensions,
    },
  );
  const subscription = crawler.events();
  const collecting = (async () => {
    for await (const event of subscription) events.push(event);
  })();
  return {
    async run() {
      const result = await crawler.run();
      await collecting;
      return result;
    },
    crawler,
    events,
    failures,
    get fetches() {
      return fetches;
    },
    get closes() {
      return closes;
    },
  };
}

async function records(result) {
  return {
    errors: await readNdjson(
      path.join(result.outputDirectory, "errors.ndjson"),
    ),
    states: await readNdjson(
      path.join(result.outputDirectory, "request-states.ndjson"),
    ),
    skipped: await readNdjson(
      path.join(result.outputDirectory, "skipped.ndjson"),
    ),
    manifest: await readJson(
      path.join(result.outputDirectory, "manifest.json"),
    ),
    summary: await fs.readFile(
      path.join(result.outputDirectory, "summary.md"),
      "utf8",
    ),
  };
}

for (const code of ["EAI_AGAIN", "ENOTFOUND"]) {
  test(`${code} is a bounded DNS failure, never a network policy skip`, async (t) => {
    const lookup = t.mock.method(dns, "lookup", async () => {
      throw Object.assign(new Error(code), { code });
    });
    const run = await fixture(t);
    const result = await run.run();
    assert.equal(result.status, "failed");
    assert.equal(result.stopReason, "frontier_empty");
    assert.equal(result.fatalError, null);
    assert.equal(result.stats.requestsScheduled, 1);
    assert.equal(result.stats.requestsAttempted, 1);
    assert.equal(result.stats.requestsFetched, 0);
    assert.equal(result.stats.requestsFailed, 1);
    assert.equal(result.stats.requestsTransportFailed, 1);
    assert.equal(result.stats.requestsPolicySkipped, 0);
    assert.equal(result.stats.networkSafetyRejectedUrls, 0);
    assert.equal(result.stats.retries, 2);
    assert.equal(run.fetches, 0);
    assert.equal(run.closes, 1);
    // http-client 0.1.1 caches negative answers. A retry is not a promise of a fresh lookup.
    assert.equal(lookup.mock.callCount(), 1);
    const saved = await records(result);
    assert.equal(saved.errors.length, 3);
    assert.ok(
      saved.errors.every(
        (error) =>
          error.code === "DNS_ERROR" && error.retryable && !error.fatal,
      ),
    );
    assert.equal(saved.skipped.length, 0);
    assert.equal(saved.states.at(-1).state, "failed");
    assert.equal(
      saved.states.filter((state) => state.state === "retrying").length,
      2,
    );
    assert.equal(saved.manifest.status, "failed");
    assert.equal(run.failures.length, 1);
    assert.equal(run.failures[0].code, "DNS_ERROR");
    assert.equal(run.events.at(-1).type, "run-finished");
    assert.equal(
      run.events.filter((event) => event.type === "request-finished").length,
      1,
    );
    assert.match(
      saved.summary,
      /No resources were fetched\. 1 request\(s\) failed/,
    );
    assert.match(saved.summary, /Transport failures \(including DNS\): 1/);
  });
}

test("a DNS retry can recover after cache expiry without repeating request hooks", async (t) => {
  let calls = 0;
  t.mock.method(dns, "lookup", async () => {
    if (++calls === 1)
      throw Object.assign(new Error("temporary"), { code: "EAI_AGAIN" });
    return publicAddress;
  });
  const run = await fixture(t, { networkSafety: { dnsCacheTtlMs: 1 } });
  const result = await run.run();
  assert.equal(result.status, "completed", JSON.stringify(result.fatalError));
  assert.equal(result.stats.requestsFetched, 1);
  assert.equal(result.stats.requestsFailed, 0);
  assert.equal(result.stats.requestsTransportFailed, 0);
  assert.equal(result.stats.requestsPolicySkipped, 0);
  assert.equal(result.stats.retries, 1);
  assert.equal(run.fetches, 1);
  assert.equal(calls, 2);
  assert.equal(
    run.events.filter((event) => event.type === "request-started").length,
    1,
  );
  assert.equal(run.closes, 1);
});

test("DNS and HTTP failures share one retry budget", async (t) => {
  let calls = 0;
  t.mock.method(dns, "lookup", async () => {
    if (++calls === 1) throw new Error("temporary");
    return publicAddress;
  });
  let fetches = 0;
  const run = await fixture(t, {
    networkSafety: { dnsCacheTtlMs: 1 },
    extensions: {
      httpClient: {
        async fetch(url, options) {
          fetches += 1;
          return {
            statusCode: null,
            finalUrl: null,
            headers: new Headers(),
            body: null,
            redirects: [],
            responseTimeMs: 0,
            error: crawlError({
              code: "FETCH_NETWORK_ERROR",
              message: "offline",
              url,
              requestId: options.requestId,
              retryable: true,
            }),
          };
        },
      },
    },
  });
  const result = await run.run();
  assert.equal(result.status, "failed");
  assert.equal(result.stats.retries, 2);
  assert.equal(fetches, 2);
  assert.equal(result.stats.requestsFailed, 1);
  assert.equal(result.stats.requestsTransportFailed, 1);
});

test("policy rejection after DNS recovery never reaches transport", async (t) => {
  let calls = 0;
  t.mock.method(dns, "lookup", async () => {
    if (++calls === 1) throw new Error("temporary");
    return [{ address: "127.0.0.1", family: 4 }];
  });
  const run = await fixture(t, { networkSafety: { dnsCacheTtlMs: 1 } });
  const result = await run.run();
  assert.equal(result.status, "completed", JSON.stringify(result.fatalError));
  assert.equal(result.stats.retries, 1);
  assert.equal(result.stats.requestsPolicySkipped, 1);
  assert.equal(result.stats.networkSafetyRejectedUrls, 1);
  assert.equal(result.stats.requestsFailed, 0);
  assert.equal(result.stats.requestsTransportFailed, 0);
  assert.equal(run.fetches, 0);
});

test("genuine network safety rejection stays completed with an explicit empty summary", async (t) => {
  const run = await fixture(t, { seeds: ["http://127.0.0.1/"] });
  const result = await run.run();
  assert.equal(result.status, "completed", JSON.stringify(result.fatalError));
  assert.equal(result.stats.requestsPolicySkipped, 1);
  assert.equal(result.stats.networkSafetyRejectedUrls, 1);
  assert.equal(result.stats.requestsTransportFailed, 0);
  assert.equal(result.stats.requestsFailed, 0);
  assert.equal(result.stats.retries, 0);
  assert.equal(run.fetches, 0);
  const saved = await records(result);
  assert.equal(saved.errors.length, 0);
  assert.equal(saved.skipped[0].reason, "NETWORK_SAFETY_REJECTED");
  assert.equal(saved.states.at(-1).state, "skipped");
  assert.match(
    saved.summary,
    /No resources were fetched\. 1 request\(s\) were skipped by policy/,
  );
  assert.match(saved.summary, /1 network safety rejections/);
});

test("mixed successful and DNS-failed seeds remain partial", async (t) => {
  t.mock.method(dns, "lookup", async (hostname) => {
    if (hostname === "failed.example") throw new Error("offline");
    return publicAddress;
  });
  const run = await fixture(t, {
    seeds: ["https://good.example/", "https://failed.example/"],
  });
  const result = await run.run();
  assert.equal(result.status, "partial", JSON.stringify(result.fatalError));
  assert.equal(result.stats.requestsFetched, 1);
  assert.equal(result.stats.requestsFailed, 1);
  assert.equal(result.stats.requestsTransportFailed, 1);
  assert.equal(result.stats.requestsPolicySkipped, 0);
  const saved = await records(result);
  assert.doesNotMatch(saved.summary, /No resources were fetched/);
  assert.equal(saved.manifest.status, "partial");
});

test(
  "abort during DNS resolution cancels the lease and closes the runtime",
  { timeout: 2000 },
  async (t) => {
    const started = Promise.withResolvers();
    t.mock.method(dns, "lookup", async () => {
      started.resolve();
      return await new Promise(() => {});
    });
    const run = await fixture(t);
    const running = run.run();
    await started.promise;
    run.crawler.abort("cancel DNS");
    const result = await running;
    assert.equal(result.status, "aborted");
    assert.equal(result.stats.requestsCancelled, 1);
    assert.equal(result.stats.requestsFailed, 0);
    assert.equal(result.stats.requestsTransportFailed, 0);
    assert.equal(run.fetches, 0);
    assert.equal(run.closes, 1);
    assert.equal((await records(result)).states.at(-1).state, "cancelled");
  },
);

test(
  "abort during DNS retry backoff does not make another attempt",
  { timeout: 2000 },
  async (t) => {
    t.mock.method(dns, "lookup", async () => {
      throw new Error("offline");
    });
    const scheduled = Promise.withResolvers();
    const run = await fixture(t, {
      network: { retryBackoffMs: 30000 },
      extensions: {
        hooks: {
          onEvent(_context, event) {
            if (event.type === "retry-scheduled") scheduled.resolve();
          },
        },
      },
    });
    const running = run.run();
    await scheduled.promise;
    run.crawler.abort("cancel retry");
    const result = await running;
    assert.equal(result.status, "aborted");
    assert.equal(result.stats.requestsCancelled, 1);
    assert.equal(result.stats.requestsFailed, 0);
    assert.equal(result.stats.retries, 1);
    assert.equal(run.fetches, 0);
    assert.equal(run.closes, 1);
  },
);

for (const scenario of [
  {
    name: "DNS failure",
    target: "http://dns-target.example/",
    code: "DNS_ERROR",
    retries: 2,
    blocked: 0,
  },
  {
    name: "blocked private IP",
    target: "http://10.0.0.1/",
    code: "REDIRECT_TARGET_REJECTED",
    retries: 0,
    blocked: 1,
  },
]) {
  test(`redirect ${scenario.name} preserves classification, safety and body cleanup`, async (t) => {
    const lookup = t.mock.method(dns, "lookup", async () => {
      throw new Error("DNS offline");
    });
    let sourceHits = 0;
    const source = await listen((_request, response) => {
      sourceHits += 1;
      response.writeHead(302, { location: scenario.target });
      response.end("discarded redirect response body");
    });
    t.after(() => closeServer(source.server));
    const root = await temporaryDirectory("site-crawler-redirect-dns-");
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const spool = path.join(root, "spool");
    await fs.mkdir(spool);
    const result = await new SiteCrawler({
      seeds: [source.origin],
      scope: { mode: "custom" },
      network: { retries: 2, retryBackoffMs: 1 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: false },
      responseLimits: { memoryThresholdBytes: 1, spoolDirectory: spool },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: { type: "filesystem", directory: root },
    }).run();
    assert.equal(result.status, "failed", JSON.stringify(result.fatalError));
    assert.equal(result.fatalError, null);
    assert.equal(result.stats.requestsFetched, 0);
    assert.equal(result.stats.requestsFailed, 1);
    assert.equal(result.stats.requestsTransportFailed, 1);
    assert.equal(result.stats.requestsPolicySkipped, 0);
    assert.equal(result.stats.retries, scenario.retries);
    assert.equal(result.stats.redirectsBlocked, scenario.blocked);
    assert.equal(sourceHits, scenario.retries + 1);
    assert.equal(
      lookup.mock.callCount(),
      scenario.code === "DNS_ERROR" ? 1 : 0,
    );
    const saved = await records(result);
    assert.ok(saved.errors.every((error) => error.code === scenario.code));
    assert.ok(
      saved.errors.every(
        (error) => error.retryable === (scenario.code === "DNS_ERROR"),
      ),
    );
    assert.equal(saved.states.at(-1).state, "failed");
    assert.deepEqual(await fs.readdir(spool), []);
  });
}

test("an empty crawl whose seeds were excluded is explained without inventing a failure", async (t) => {
  const root = await temporaryDirectory("site-crawler-empty-summary-");
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await new SiteCrawler({
    seeds: ["https://excluded.example/"],
    scope: { exclude: ["*excluded.example*"] },
    robots: { enabled: false },
    sitemaps: { enabled: false },
    storage: { type: "filesystem", directory: root },
  }).run();
  assert.equal(result.status, "completed");
  assert.equal(result.stats.requestsScheduled, 0);
  assert.equal(result.stats.requestsFetched, 0);
  assert.equal(result.stats.requestsFailed, 0);
  assert.equal(result.stats.urlsSkipped, 1);
  assert.match(
    (await records(result)).summary,
    /1 URL\(s\) were skipped before fetching/,
  );
});
