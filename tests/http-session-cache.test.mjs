import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http2 from "node:http2";
import path from "node:path";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/public.js";
import { SiteCrawler } from "../dist/index.js";
import { disposeResponseBody, readResponseBody } from "../dist/http/body.js";
import { HttpFetcher } from "../dist/http/index.js";
import { SessionManager } from "../dist/http/session/manager.js";
import { NetworkSafetyPolicy } from "../dist/network/index.js";
import {
  closeServer,
  crawlInput,
  listen,
  temporaryDirectory,
} from "./helpers.mjs";

const redirectDecision = async () => ({
  allowed: true,
  reason: null,
  scopeAllowed: true,
  robotsAllowed: true,
  networkSafetyAllowed: true,
});

function transportConfig(overrides = {}) {
  return resolveConfig({
    seeds: ["https://127.0.0.1/"],
    storage: { type: "memory", frontierBackend: "memory" },
    robots: { enabled: false },
    sitemaps: { enabled: false },
    networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
    network: {
      maxConcurrency: 1,
      maxConcurrencyPerOrigin: 1,
      requestTimeoutMs: 5_000,
      connectTimeoutMs: 2_000,
      firstByteTimeoutMs: 2_000,
      rejectUnauthorized: false,
      ...overrides.network,
    },
    responseLimits: {
      maxCompressedBytes: 2_000_000,
      maxDecompressedBytes: 2_000_000,
      memoryThresholdBytes: 1_024,
      ...overrides.responseLimits,
    },
  });
}

test("HTTP/2 transport negotiates a secure local session", async () => {
  const key = await fs.readFile(
    new URL("../benchmarks/fixtures/localhost-key.pem", import.meta.url),
  );
  const cert = await fs.readFile(
    new URL("../benchmarks/fixtures/localhost-cert.pem", import.meta.url),
  );
  const server = http2.createSecureServer({ key, cert });
  server.on("stream", (stream) => {
    stream.respond({ ":status": 200, "content-type": "text/plain" });
    stream.end("h2 response");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const config = transportConfig({ network: { protocolPreference: "http2" } });
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  try {
    const result = await client.fetch(`https://127.0.0.1:${address.port}/`, {
      requestId: "request_h2",
      method: "GET",
      headers: {},
      onRedirectTarget: redirectDecision,
    });
    assert.equal(result.error, null);
    assert.equal(result.protocol, "h2");
    assert.equal(result.statusCode, 200);
    assert.notEqual(result.body, null);
    assert.equal(
      new TextDecoder().decode(await readResponseBody(result.body)),
      "h2 response",
    );
    assert.equal(result.timings.firstByteMs !== null, true);
    await disposeResponseBody(result.body);
  } finally {
    await client.close();
    server.close();
  }
});

test("large decoded responses spool to disk and can be disposed", async () => {
  const payload = Buffer.alloc(64 * 1_024, 97);
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "application/octet-stream");
    response.end(payload);
  });
  const spool = await temporaryDirectory("site-crawler-v08-spool-");
  const config = transportConfig({
    network: { protocolPreference: "http1" },
    responseLimits: { memoryThresholdBytes: 512, spoolDirectory: spool },
  });
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  try {
    const result = await client.fetch(`${fixture.origin}/asset.bin`, {
      requestId: "request_spool",
      method: "GET",
      headers: {},
      onRedirectTarget: redirectDecision,
    });
    assert.equal(result.error, null);
    assert.equal(result.body?.kind, "file");
    if (result.body?.kind !== "file") throw new Error("Expected file body.");
    assert.equal(result.body.size, payload.byteLength);
    assert.equal((await fs.stat(result.body.path)).isFile(), true);
    const bodyPath = result.body.path;
    await disposeResponseBody(result.body);
    await assert.rejects(fs.stat(bodyPath), /ENOENT/u);
  } finally {
    await client.close();
    await closeServer(fixture.server);
    await fs.rm(spool, { recursive: true, force: true });
  }
});

test("HTTP sessions carry cookies and configured authorization", async () => {
  let cookieSeen = false;
  let authorizationSeen = false;
  const fixture = await listen((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/next") {
      cookieSeen = request.headers.cookie === "session=accepted";
      authorizationSeen = request.headers.authorization === "Bearer secret";
      response.end("<html><body>next</body></html>");
      return;
    }
    response.setHeader("set-cookie", "session=accepted; Path=/; HttpOnly");
    response.end('<html><body><a href="/next">next</a></body></html>');
  });
  try {
    const result = await new SiteCrawler(
      crawlInput(fixture.origin, {
        session: {
          enabled: true,
          bearerAuth: [{ origin: fixture.origin, token: "secret" }],
        },
      }),
    ).run();
    assert.notEqual(result.status, "failed");
    assert.equal(cookieSeen, true);
    assert.equal(authorizationSeen, true);
  } finally {
    await closeServer(fixture.server);
  }
});

test("persistent cookie storage repairs permissive paths", async () => {
  if (process.platform === "win32") return;
  const root = await temporaryDirectory("site-crawler-private-cookies-");
  const cookieFile = path.join(root, "cookies.json");
  const config = {
    enabled: true,
    persistCookies: true,
    cookieFile,
    initialCookies: [
      { url: "https://example.com/", cookie: "session=private; Path=/" },
    ],
    basicAuth: [],
    bearerAuth: [],
  };
  try {
    await new SessionManager(config).close();
    await fs.chmod(root, 0o777);
    await fs.chmod(cookieFile, 0o666);
    const restored = new SessionManager({ ...config, initialCookies: [] });
    assert.equal(
      (await restored.requestHeaders("https://example.com/", {})).cookie,
      "session=private",
    );
    assert.equal((await fs.stat(root)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(cookieFile)).mode & 0o777, 0o600);
    await restored.close();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("conditional recrawl reuses a cached body after HTTP 304", async () => {
  const cacheDirectory = await temporaryDirectory("site-crawler-v08-cache-");
  let requests = 0;
  let conditionalSeen = false;
  const fixture = await listen((request, response) => {
    requests += 1;
    conditionalSeen ||= request.headers["if-none-match"] === '"v1"';
    response.setHeader("etag", '"v1"');
    if (conditionalSeen) {
      response.statusCode = 304;
      response.end();
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      "<html><head><title>Cached</title></head><body>body</body></html>",
    );
  });
  const config = crawlInput(fixture.origin, {
    httpCache: { enabled: true, directory: cacheDirectory },
  });
  try {
    const first = await new SiteCrawler(config).run();
    if (process.platform !== "win32") {
      await fs.chmod(cacheDirectory, 0o777);
      for (const entry of await fs.readdir(cacheDirectory)) {
        await fs.chmod(path.join(cacheDirectory, entry), 0o666);
      }
    }
    const second = await new SiteCrawler(config).run();
    assert.equal(first.stats.htmlPagesParsed, 1);
    assert.equal(second.stats.htmlPagesParsed, 1);
    assert.equal(requests, 2);
    assert.equal(conditionalSeen, true);
    if (process.platform !== "win32") {
      assert.equal((await fs.stat(cacheDirectory)).mode & 0o777, 0o700);
      for (const entry of await fs.readdir(cacheDirectory)) {
        assert.equal(
          (await fs.stat(path.join(cacheDirectory, entry))).mode & 0o777,
          0o600,
        );
      }
    }
  } finally {
    await closeServer(fixture.server);
    await fs.rm(cacheDirectory, { recursive: true, force: true });
  }
});
