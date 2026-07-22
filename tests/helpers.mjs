import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

export async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

export async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
    server.closeAllConnections();
  });
}

export async function temporaryDirectory(prefix) {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function readNdjson(filePath) {
  let text;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

export function crawlInput(origin, overrides = {}) {
  return {
    seeds: [`${origin}/`],
    limits: { maxScheduledRequests: 50, maxDepth: 5, ...overrides.limits },
    network: {
      maxConcurrency: 2,
      maxConcurrencyPerOrigin: 1,
      requestTimeoutMs: 2_000,
      ...overrides.network,
    },
    networkSafety: {
      allowLocalhost: true,
      allowPrivateNetworks: true,
      ...overrides.networkSafety,
    },
    robots: { enabled: false, ...overrides.robots },
    sitemaps: { enabled: false, ...overrides.sitemaps },
    storage: { type: "memory", ...overrides.storage },
    ...(overrides.responseLimits === undefined
      ? {}
      : { responseLimits: overrides.responseLimits }),
    ...(overrides.output === undefined ? {} : { output: overrides.output }),
    ...(overrides.rendering === undefined
      ? {}
      : { rendering: overrides.rendering }),
    ...(overrides.feeds === undefined ? {} : { feeds: overrides.feeds }),
    ...(overrides.jsDiscovery === undefined
      ? {}
      : { jsDiscovery: overrides.jsDiscovery }),
    ...(overrides.cssDiscovery === undefined
      ? {}
      : { cssDiscovery: overrides.cssDiscovery }),
    ...(overrides.session === undefined ? {} : { session: overrides.session }),
    ...(overrides.httpCache === undefined
      ? {}
      : { httpCache: overrides.httpCache }),
  };
}
