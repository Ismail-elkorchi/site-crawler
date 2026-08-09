import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/index.js";
import { HttpFetcher } from "../dist/http/index.js";
import { readResponseBody } from "@ismail-elkorchi/http-client";
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
      maxWireBytes: 100_000,
      maxDecodedBytes: 100_000,
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
  const client = new HttpFetcher(config);
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
    responseLimits: { maxDecodedBytes: 100 },
  });
  const client = new HttpFetcher(config);
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
  const client = new HttpFetcher(config);
  try {
    const result = await client.fetch(`${origin}/a`, options());
    assert.equal(result.error.code, "REDIRECT_LOOP");
    assert.equal(result.redirects.length, 2);
  } finally {
    await client.close();
    await closeServer(server);
  }
});

test("HTTP client strips configured and request credentials across origins", async () => {
  let targetHeaders = null;
  const target = await listen((request, response) => {
    targetHeaders = request.headers;
    response.end("target");
  });
  const source = await listen((_request, response) => {
    response.writeHead(302, { location: `${target.origin}/target` });
    response.end();
  });
  const config = fetcherConfig({
    network: { headers: { authorization: "Bearer configured" } },
  });
  const client = new HttpFetcher(config);
  try {
    const result = await client.fetch(`${source.origin}/start`, {
      ...options(),
      headers: {
        cookie: "session=request",
        "proxy-authorization": "Basic request",
      },
    });
    assert.equal(result.error, null);
    assert.equal(targetHeaders?.authorization, undefined);
    assert.equal(targetHeaders?.cookie, undefined);
    assert.equal(targetHeaders?.["proxy-authorization"], undefined);
  } finally {
    await client.close();
    await Promise.all([closeServer(source.server), closeServer(target.server)]);
  }
});

test("HTTP client stops at a rejected redirect target", async () => {
  const { server, origin } = await listen((_request, response) => {
    response.statusCode = 302;
    response.setHeader("location", "/target");
    response.end();
  });
  const config = fetcherConfig();
  const client = new HttpFetcher(config);
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
  const client = new HttpFetcher(config);
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
  const client = new HttpFetcher(config);
  try {
    const result = await client.fetch(`${origin}/timeout`, options());
    assert.equal(result.error.code, "FETCH_TIMEOUT");
  } finally {
    await client.close();
    await closeServer(server);
  }
});

test("request timeout covers the complete redirect operation", async () => {
  const { server, origin } = await listen((request, response) => {
    const hop = Number(new URL(request.url, origin).searchParams.get("hop"));
    setTimeout(() => {
      if (hop < 2) {
        response.writeHead(302, { location: `/?hop=${String(hop + 1)}` });
        response.end();
        return;
      }
      response.end("complete");
    }, 30);
  });
  const config = fetcherConfig({ network: { requestTimeoutMs: 70 } });
  const client = new HttpFetcher(config);
  try {
    const result = await client.fetch(`${origin}/?hop=0`, options());
    assert.equal(result.error?.code, "FETCH_TIMEOUT");
  } finally {
    await client.close();
    await closeServer(server);
  }
});
