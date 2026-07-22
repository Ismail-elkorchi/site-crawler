import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http2 from "node:http2";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/index.js";
import { discoverCssUrls } from "../dist/css/index.js";
import { SiteCrawler } from "../dist/index.js";
import { disposeResponseBody, readResponseBody } from "../dist/http/body.js";
import { HttpFetcher } from "../dist/http/index.js";
import { discoverJavascriptUrls } from "../dist/javascript/index.js";
import { NetworkSafetyPolicy } from "../dist/network/index.js";
import { PolitenessController } from "../dist/politeness/index.js";
import {
  closeServer,
  crawlInput,
  listen,
  temporaryDirectory,
} from "./helpers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fetchOptions(requestId = "request") {
  return {
    requestId,
    method: "GET",
    headers: {},
    async onRedirectTarget() {
      return {
        allowed: true,
        reason: null,
        scopeAllowed: true,
        robotsAllowed: true,
        networkSafetyAllowed: true,
      };
    },
  };
}

function httpConfig(origin, overrides = {}) {
  return resolveConfig({
    seeds: [`${origin}/`],
    networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
    network: {
      requestTimeoutMs: 5_000,
      connectTimeoutMs: 2_000,
      firstByteTimeoutMs: 2_000,
      ...overrides.network,
    },
    responseLimits: {
      maxCompressedBytes: 1_000_000,
      maxDecompressedBytes: 1_000_000,
      ...overrides.responseLimits,
    },
    session: { ...overrides.session },
    httpCache: { ...overrides.httpCache },
    robots: { enabled: false },
    sitemaps: { enabled: false },
    storage: { type: "memory" },
  });
}

test("HTTP/2 transport negotiates h2 and reuses a secure fixture", async () => {
  const key = await fs.readFile(
    path.join(root, "benchmarks/fixtures/localhost-key.pem"),
  );
  const cert = await fs.readFile(
    path.join(root, "benchmarks/fixtures/localhost-cert.pem"),
  );
  const server = http2.createSecureServer({ key, cert });
  server.on("stream", (stream) => {
    stream.respond({ ":status": 200, "content-type": "text/plain" });
    stream.end("h2-ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const origin = `https://localhost:${address.port}`;
  const config = httpConfig(origin, {
    network: { protocolPreference: "http2", rejectUnauthorized: false },
  });
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  try {
    const first = await client.fetch(`${origin}/one`, fetchOptions("h2-one"));
    const second = await client.fetch(`${origin}/two`, fetchOptions("h2-two"));
    assert.equal(first.error, null);
    assert.equal(second.error, null);
    assert.equal(first.protocol, "h2");
    assert.equal(second.protocol, "h2");
    assert.equal(
      Buffer.from(await readResponseBody(first.body)).toString(),
      "h2-ok",
    );
    await disposeResponseBody(first.body);
    await disposeResponseBody(second.body);
  } finally {
    await client.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("large response bodies spool to a bounded temporary file", async () => {
  const payload = Buffer.from("x".repeat(32_000));
  const fixture = await listen((_request, response) => response.end(payload));
  const spool = await temporaryDirectory("site-crawler-v08-spool-");
  const config = httpConfig(fixture.origin, {
    responseLimits: { memoryThresholdBytes: 128, spoolDirectory: spool },
  });
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  try {
    const result = await client.fetch(
      `${fixture.origin}/body`,
      fetchOptions("spool"),
    );
    assert.equal(result.error, null);
    assert.equal(result.body.kind, "file");
    assert.equal(result.body.size, payload.byteLength);
    assert.equal(path.dirname(result.body.path), spool);
    assert.deepEqual(Buffer.from(await readResponseBody(result.body)), payload);
    const filePath = result.body.path;
    await disposeResponseBody(result.body);
    await assert.rejects(fs.access(filePath));
  } finally {
    await client.close();
    await closeServer(fixture.server);
    await fs.rm(spool, { recursive: true, force: true });
  }
});

test("sessions provide basic authentication and preserve response cookies", async () => {
  const requests = [];
  const fixture = await listen((request, response) => {
    requests.push({
      authorization: request.headers.authorization,
      cookie: request.headers.cookie,
    });
    response.setHeader("set-cookie", "crawl_session=ready; Path=/");
    response.end("ok");
  });
  const token = Buffer.from("crawler:secret").toString("base64");
  const config = httpConfig(fixture.origin, {
    session: {
      enabled: true,
      basicAuth: [
        { origin: fixture.origin, username: "crawler", password: "secret" },
      ],
    },
  });
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  try {
    await client.fetch(
      `${fixture.origin}/first`,
      fetchOptions("session-first"),
    );
    await client.fetch(
      `${fixture.origin}/second`,
      fetchOptions("session-second"),
    );
    assert.equal(requests[0].authorization, `Basic ${token}`);
    assert.equal(requests[0].cookie, undefined);
    assert.equal(requests[1].authorization, `Basic ${token}`);
    assert.match(requests[1].cookie, /crawl_session=ready/u);
  } finally {
    await client.sessionManager().close();
    await client.close();
    await closeServer(fixture.server);
  }
});

test("conditional recrawling reuses a cached body after 304", async () => {
  let requestCount = 0;
  const fixture = await listen((request, response) => {
    requestCount += 1;
    if (request.headers["if-none-match"] === '"fixture"') {
      response.statusCode = 304;
      response.setHeader("etag", '"fixture"');
      response.end();
      return;
    }
    response.setHeader("etag", '"fixture"');
    response.setHeader("content-type", "text/plain");
    response.end("cached-body");
  });
  const cacheDirectory = await temporaryDirectory("site-crawler-v08-cache-");
  const config = httpConfig(fixture.origin, {
    httpCache: { enabled: true, directory: cacheDirectory, storeBodies: true },
  });
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  try {
    const first = await client.fetch(
      `${fixture.origin}/etag`,
      fetchOptions("cache-one"),
    );
    const second = await client.fetch(
      `${fixture.origin}/etag`,
      fetchOptions("cache-two"),
    );
    assert.equal(first.cacheStatus, "stored");
    assert.equal(second.statusCode, 304);
    assert.equal(second.cacheStatus, "revalidated");
    assert.equal(
      Buffer.from(await readResponseBody(second.body)).toString(),
      "cached-body",
    );
    assert.equal(requestCount, 2);
    await disposeResponseBody(first.body);
    await disposeResponseBody(second.body);
  } finally {
    await client.close();
    await closeServer(fixture.server);
    await fs.rm(cacheDirectory, { recursive: true, force: true });
  }
});

test("AST JavaScript and CSS discovery preserve extraction evidence", () => {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    jsDiscovery: { enabled: true, mode: "ast" },
    cssDiscovery: { enabled: true },
    robots: { enabled: false },
    sitemaps: { enabled: false },
    storage: { type: "memory" },
  });
  const javascript = discoverJavascriptUrls(
    'fetch("/api/items"); import("/chunks/view.js"); //# sourceMappingURL=app.js.map',
    config,
  );
  const css = discoverCssUrls(
    '@import url("/theme.css"); .hero { background: url(/hero.webp) }',
    config,
  );
  assert.equal(
    javascript.some((item) => item.rawUrl === "/api/items"),
    true,
  );
  assert.equal(
    javascript.some((item) => item.rawUrl === "/chunks/view.js"),
    true,
  );
  assert.equal(
    javascript.some((item) => item.method === "source-map"),
    true,
  );
  assert.equal(
    javascript.every((item) => item.offset === null || item.offset >= 0),
    true,
  );
  assert.equal(
    css.some((item) => item.rawUrl === "/theme.css"),
    true,
  );
  assert.equal(
    css.some((item) => item.rawUrl === "/hero.webp"),
    true,
  );
});

test("JavaScript ranking retains later call evidence and proves XHR receivers", () => {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    jsDiscovery: { enabled: true, mode: "ast", maxUrlsPerScript: 2 },
    robots: { enabled: false },
    sitemaps: { enabled: false },
    storage: { type: "memory" },
  });
  const discovered = discoverJavascriptUrls(
    `"/low-one"; "/low-two";
     window.open("/window"); arbitrary.open("GET", "/arbitrary");
     const request = new XMLHttpRequest(); request["open"]("GET", "/xhr");
     fetch("/high");`,
    config,
  );
  assert.deepEqual(
    discovered.map(({ rawUrl, method }) => ({ rawUrl, method })),
    [
      { rawUrl: "/xhr", method: "xhr-open" },
      { rawUrl: "/high", method: "fetch-call" },
    ],
  );
  const wider = discoverJavascriptUrls(
    'window.open("/window"); arbitrary.open("GET", "/arbitrary");',
    resolveConfig({
      seeds: ["https://example.com/"],
      jsDiscovery: { enabled: true, mode: "ast", maxUrlsPerScript: 10 },
      robots: { enabled: false },
      sitemaps: { enabled: false },
    }),
  );
  assert.equal(
    wider.some((item) => item.method === "xhr-open"),
    false,
  );
});

test("CSS discovery recognizes tokens rather than substrings", () => {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    cssDiscovery: { enabled: true, maxUrlsPerStylesheet: 10 },
    robots: { enabled: false },
    sitemaps: { enabled: false },
  });
  const discovered = discoverCssUrls(
    `.myurl { content: "url('/string')"; }
     @important "/not-import.css";
     @\\69mport "/escaped-import.css";
     .hero { background: u\\72l("/escaped-url.webp") }
     .bad { background: url("/unterminated" }`,
    config,
  );
  assert.deepEqual(
    discovered.map(({ rawUrl, method }) => ({ rawUrl, method })),
    [
      { rawUrl: "/escaped-import.css", method: "import" },
      { rawUrl: "/escaped-url.webp", method: "url" },
    ],
  );
});

test("typed request middleware can skip a request without transport failure", async () => {
  let hits = 0;
  const fixture = await listen((_request, response) => {
    hits += 1;
    response.end("unexpected");
  });
  try {
    const result = await new SiteCrawler(
      crawlInput(fixture.origin, {
        limits: { maxScheduledRequests: 1, maxFetchedResources: 1 },
      }),
      {
        middlewares: {
          beforeRequest: [
            () => ({
              kind: "skip",
              reason: "USER_EXCLUDE_PATTERN",
              detail: "fixture skip",
            }),
          ],
        },
      },
    ).run();
    assert.equal(result.status, "completed");
    assert.equal(result.stats.requestsPolicySkipped, 1);
    assert.equal(result.stats.requestsTransportFailed, 0);
    assert.equal(hits, 0);
  } finally {
    await closeServer(fixture.server);
  }
});

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
