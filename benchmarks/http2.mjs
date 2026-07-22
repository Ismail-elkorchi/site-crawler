import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http2 from "node:http2";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "../dist/config/public.js";
import { disposeResponseBody } from "../dist/http/body.js";
import { HttpFetcher } from "../dist/http/index.js";
import { NetworkSafetyPolicy } from "../dist/network/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function benchmarkHttp2(requestCount = 100) {
  const key = await fs.readFile(
    path.join(root, "benchmarks/fixtures/localhost-key.pem"),
  );
  const cert = await fs.readFile(
    path.join(root, "benchmarks/fixtures/localhost-cert.pem"),
  );
  const sessions = new Set();
  const server = http2.createSecureServer({ key, cert });
  server.on("session", (session) => {
    sessions.add(session);
    session.once("close", () => sessions.delete(session));
  });
  server.on("stream", (stream) => {
    stream.respond({ ":status": 200, "content-type": "text/plain" });
    stream.end("h2-ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const origin = `https://127.0.0.1:${address.port}`;
  const config = resolveConfig({
    seeds: [`${origin}/`],
    storage: { type: "memory", frontierBackend: "memory" },
    robots: { enabled: false },
    sitemaps: { enabled: false },
    networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
    network: {
      protocolPreference: "http2",
      rejectUnauthorized: false,
      maxConcurrency: requestCount,
      maxConcurrencyPerOrigin: requestCount,
      requestTimeoutMs: 10_000,
      connectTimeoutMs: 5_000,
      firstByteTimeoutMs: 5_000,
    },
    responseLimits: {
      maxCompressedBytes: 1_000_000,
      maxDecompressedBytes: 1_000_000,
    },
  });
  const client = new HttpFetcher(
    config,
    new NetworkSafetyPolicy(config.networkSafety),
  );
  const startedAt = performance.now();
  try {
    const results = await Promise.all(
      Array.from(
        { length: requestCount },
        async (_, index) =>
          await client.fetch(`${origin}/request/${index}`, {
            requestId: `benchmark_http2_${index}`,
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
          }),
      ),
    );
    const totalMs = performance.now() - startedAt;
    assert.equal(
      results.every((result) => result.error === null),
      true,
    );
    assert.equal(
      results.every((result) => result.protocol === "h2"),
      true,
    );
    assert.equal(
      results.every((result) => result.statusCode === 200),
      true,
    );
    await Promise.all(
      results.map(async (result) => await disposeResponseBody(result.body)),
    );
    return {
      name: "http2-multiplexing",
      requestCount,
      totalMs,
      requestsPerSecond: requestCount / (totalMs / 1_000),
      serverSessions: sessions.size,
    };
  } finally {
    await client.close();
    for (const session of sessions) session.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}
