import assert from "node:assert/strict";
import http from "node:http";
import { SiteCrawler } from "../dist/index.js";
import { SITE_CRAWLER_VERSION } from "../dist/core/version.js";

const durationMs = Number(process.env.SITE_CRAWLER_SOAK_MS ?? "60000");
if (!Number.isFinite(durationMs) || durationMs <= 0)
  throw new Error("SITE_CRAWLER_SOAK_MS must be positive.");
const server = http.createServer((request, response) => {
  response.setHeader("content-type", "text/html; charset=utf-8");
  const match = /\/page\/(\d+)/u.exec(request.url ?? "");
  const page = match === null ? 0 : Number(match[1]);
  const next = (page + 1) % 100;
  response.end(`<html><body><a href="/page/${next}">next</a></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.equal(typeof address, "object");
const origin = `http://127.0.0.1:${address.port}`;
const started = Date.now();
const rssStart = process.memoryUsage().rss;
let iterations = 0;
try {
  while (Date.now() - started < durationMs) {
    const result = await new SiteCrawler({
      seeds: [`${origin}/page/0`],
      limits: { maxScheduledRequests: 100, maxFetchedResources: 100 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: { type: "memory" },
    }).run();
    assert.notEqual(result.status, "failed");
    iterations += 1;
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
process.stdout.write(
  `${JSON.stringify({ schemaId: "site-crawler.soak", schemaVersion: 1, crawlerVersion: SITE_CRAWLER_VERSION, durationMs: Date.now() - started, iterations, rssStart, rssEnd: process.memoryUsage().rss }, null, 2)}\n`,
);
