import assert from "node:assert/strict";
import { resolveConfig } from "../dist/config/public.js";
import { extractXmlResource } from "../dist/xml/index.js";

export function benchmarkSitemap(entryCount = 50_000) {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    robots: { enabled: false },
    sitemaps: {
      enabled: true,
      maxEntriesPerSitemap: entryCount,
      maxTotalEntries: entryCount,
    },
    parsing: {
      xml: {
        maxStreamBytes: 16 * 1_024 * 1_024,
        maxNodes: entryCount * 4 + 100,
        maxDepth: 32,
        maxTextBytes: 16 * 1_024 * 1_024,
      },
    },
    storage: { type: "memory", frontierBackend: "memory" },
  });
  const urls = Array.from(
    { length: entryCount },
    (_, index) => `<url><loc>https://example.com/page/${index}</loc></url>`,
  ).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  const memoryBefore = process.memoryUsage().rss;
  const startedAt = performance.now();
  const resource = extractXmlResource({
    runId: "benchmark_sitemap",
    requestId: "request_sitemap",
    resourceId: "resource_sitemap",
    requestedUrl: "https://example.com/sitemap.xml",
    finalUrl: "https://example.com/sitemap.xml",
    normalizedUrl: "https://example.com/sitemap.xml",
    encoding: null,
    evidence: null,
    decodingWarnings: [],
    config,
    xml,
  });
  assert.equal(resource.xmlKind, "sitemap");
  assert.equal(resource.sitemapEntries.length, entryCount);
  return {
    name: "sitemap-document",
    entryCount,
    inputBytes: Buffer.byteLength(xml),
    totalMs: performance.now() - startedAt,
    rssDeltaBytes: process.memoryUsage().rss - memoryBefore,
    parserBudgetStatus: resource.parserBudgets.status,
  };
}
