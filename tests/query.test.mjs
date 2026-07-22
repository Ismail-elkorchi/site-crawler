import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";
import { SiteCrawler } from "../dist/index.js";
import { CrawlIndex } from "../dist/query/public.js";
import { closeServer, listen, temporaryDirectory } from "./helpers.mjs";

test("read-only SQLite query API inspects completed crawl evidence", async () => {
  const fixture = await listen((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/") {
      response.end('<html><body><a href="/next">next</a></body></html>');
      return;
    }
    response.end("<html><body>next</body></html>");
  });
  const root = await temporaryDirectory("site-crawler-query-");
  try {
    const result = await new SiteCrawler({
      seeds: [`${fixture.origin}/`],
      limits: { maxScheduledRequests: 2, maxFetchedResources: 2 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: { type: "sqlite", directory: root },
    }).run();
    assert.notEqual(result.outputDirectory, null);
    const index = new CrawlIndex(result.outputDirectory);
    try {
      assert.equal(index.count({ kind: "resource" }), 2);
      assert.equal(index.query({ kind: "link", limit: 10 }).length >= 1, true);
      assert.equal(index.resourcesByType("html").length, 2);
      assert.equal(index.outgoingLinks(`${fixture.origin}/`).length >= 1, true);
      const manifest = index.metadata("manifest");
      assert.equal(isRecord(manifest), true);
      if (isRecord(manifest)) assert.equal(manifest["crawlerVersion"], "0.1.0");
      assert.equal(index.metadata("summary") !== null, true);
    } finally {
      index.close();
    }
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
