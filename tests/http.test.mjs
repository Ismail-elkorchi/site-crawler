import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/index.js";
import { HttpFetcher, readResponseBody } from "../dist/http/index.js";
import { NetworkSafetyPolicy } from "../dist/network/index.js";
import { closeServer, listen } from "./helpers.mjs";

function fetcherConfig(overrides = {}) {
  return resolveConfig({
    seeds: ["http://127.0.0.1/"],
    networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
    network: {
      requestTimeoutMs: 1_000,
      maxRedirects: 5,
      ...overrides.network,
    },
    responseLimits: {
      maxCompressedBytes: 100_000,
      maxDecompressedBytes: 100_000,
      ...overrides.responseLimits,
    },
    storage: { type: "memory" },
  });
}

function options(signal, redirectAllowed = true) {
  return {
    requestId: "request",
    method: "GET",
    headers: {},
    ...(signal === undefined ? {} : { signal }),
    async onRedirectTarget() {
      return {
        allowed: redirectAllowed,
        reason: redirectAllowed ? null : "fixture rejection",
        scopeAllowed: redirectAllowed,
        robotsAllowed: redirectAllowed,
        networkSafetyAllowed: redirectAllowed,
      };
    },
  };
}

test("HTTP client reports wire and decoded byte counts", async () => {
  const decoded = Buffer.from("decoded response body".repeat(20));
  const encoded = gzipSync(decoded);
  const { server, origin } = await listen((_request, response) => {
    response.setHeader("content-encoding", "gzip");
    response.setHeader("content-length", encoded.byteLength);
    response.end(encoded);
  });
  const config = fetcherConfig();
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  try {
    const result = await client.fetch(`${origin}/gzip`, options());
    assert.equal(result.error, null);
    assert.equal(result.wireBytesRead, encoded.byteLength);
    assert.equal(result.decodedBytesRead, decoded.byteLength);
    assert.notEqual(result.body, null);
    assert.deepEqual(Buffer.from(await readResponseBody(result.body)), decoded);
  } finally {
    await client.close();
    await closeServer(server);
  }
});

test("HTTP client enforces decoded body limits while streaming", async () => {
  const encoded = gzipSync(Buffer.from("x".repeat(10_000)));
  const { server, origin } = await listen((_request, response) => {
    response.setHeader("content-encoding", "gzip");
    response.end(encoded);
  });
  const config = fetcherConfig({
    responseLimits: { maxDecompressedBytes: 100 },
  });
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  try {
    const result = await client.fetch(`${origin}/large`, options());
    assert.equal(result.body, null);
    assert.equal(result.error.code, "DECOMPRESSED_RESPONSE_TOO_LARGE");
  } finally {
    await client.close();
    await closeServer(server);
  }
});

test("HTTP client detects redirect loops", async () => {
  const { server, origin } = await listen((request, response) => {
    response.statusCode = 302;
    response.setHeader("location", request.url === "/a" ? "/b" : "/a");
    response.end();
  });
  const config = fetcherConfig();
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  try {
    const result = await client.fetch(`${origin}/a`, options());
    assert.equal(result.error.code, "REDIRECT_LOOP");
    assert.equal(result.redirects.length, 2);
  } finally {
    await client.close();
    await closeServer(server);
  }
});

test("HTTP client stops at a rejected redirect target", async () => {
  const { server, origin } = await listen((_request, response) => {
    response.statusCode = 302;
    response.setHeader("location", "/target");
    response.end();
  });
  const config = fetcherConfig();
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  try {
    const result = await client.fetch(`${origin}/`, options(undefined, false));
    assert.equal(result.error.code, "REDIRECT_TARGET_REJECTED");
    assert.equal(result.redirects.length, 1);
  } finally {
    await client.close();
    await closeServer(server);
  }
});

test("HTTP client distinguishes caller cancellation", async () => {
  const { server, origin } = await listen((_request, response) => {
    setTimeout(() => response.end("late"), 200);
  });
  const config = fetcherConfig();
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  try {
    const result = await client.fetch(
      `${origin}/slow`,
      options(controller.signal),
    );
    assert.equal(result.error.code, "FETCH_ABORTED");
  } finally {
    await client.close();
    await closeServer(server);
  }
});

test("HTTP client distinguishes request timeout", async () => {
  const { server, origin } = await listen((_request, response) => {
    setTimeout(() => response.end("late"), 150);
  });
  const config = fetcherConfig({ network: { requestTimeoutMs: 20 } });
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  try {
    const result = await client.fetch(`${origin}/timeout`, options());
    assert.equal(result.error.code, "FETCH_TIMEOUT");
  } finally {
    await client.close();
    await closeServer(server);
  }
});
