import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { SiteCrawler } from "../dist/index.js";

export async function benchmarkMultiOrigin(
  originCount = 4,
  pagesPerOrigin = 100,
) {
  const fixtures = await Promise.all(
    Array.from({ length: originCount }, () => listen(pagesPerOrigin)),
  );
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "site-crawler-bench-crawl-"),
  );
  const startedAt = performance.now();
  try {
    const crawler = new SiteCrawler({
      seeds: fixtures.map((fixture) => fixture.origin),
      limits: {
        maxScheduledRequests: originCount * (pagesPerOrigin + 1),
        maxFetchedResources: originCount * (pagesPerOrigin + 1),
        maxDepth: 2,
      },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      network: {
        maxConcurrency: originCount * 2,
        maxConcurrencyPerOrigin: 2,
        autoThrottle: { enabled: false },
      },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: {
        type: "sqlite",
        directory,
        frontierBackend: "sqlite",
        writeNdjsonExports: false,
      },
    });
    const result = await crawler.run();
    assert.notEqual(result.status, "failed");
    assert.equal(
      result.stats.requestsFetched,
      originCount * (pagesPerOrigin + 1),
    );
    return {
      name: "multi-origin-crawl",
      origins: originCount,
      pagesPerOrigin,
      fetched: result.stats.requestsFetched,
      totalMs: performance.now() - startedAt,
      requestsPerSecond:
        result.stats.requestsFetched /
        ((performance.now() - startedAt) / 1_000),
      peakConcurrency: result.stats.peakConcurrency,
    };
  } finally {
    await Promise.all(
      fixtures.map(async (fixture) => await close(fixture.server)),
    );
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function listen(pages) {
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/") {
      const links = Array.from(
        { length: pages },
        (_, index) => `<a href="/page/${index}">${index}</a>`,
      ).join("");
      response.end(`<html><body>${links}</body></html>`);
      return;
    }
    response.end(`<html><body>${request.url}</body></html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  return { server, origin: `http://127.0.0.1:${address.port}/` };
}

async function close(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
