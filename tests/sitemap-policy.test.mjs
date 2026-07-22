import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/public.js";
import { extractXmlResource } from "../dist/experimental/public.js";
import { SiteCrawler } from "../dist/index.js";
import {
  closeServer,
  crawlInput,
  listen,
  readNdjson,
  temporaryDirectory,
} from "./helpers.mjs";

function xmlConfig(overrides = {}) {
  return resolveConfig({
    seeds: ["https://example.com/"],
    robots: { enabled: false },
    sitemaps: { enabled: true, ...overrides },
  });
}

test("sitemap entries report missing locations and invalid optional fields", () => {
  const xml = `<?xml version="1.0"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><lastmod>invalid</lastmod></url>
      <url>
        <loc>http://[</loc>
        <lastmod>not-a-date</lastmod>
        <changefreq>sometimes</changefreq>
        <priority>2</priority>
      </url>
    </urlset>`;
  const resource = extractXmlResource({
    xml,
    runId: "run_test",
    requestId: "request_test",
    resourceId: "resource_test",
    requestedUrl: "https://example.com/sitemap.xml",
    finalUrl: "https://example.com/sitemap.xml",
    normalizedUrl: "https://example.com/sitemap.xml",
    encoding: null,
    decodingWarnings: [],
    config: xmlConfig(),
  });
  assert.equal(resource.sitemapEntries.length, 2);
  const messages = resource.sitemapEntries.flatMap((entry) =>
    entry.warnings.map((warning) => warning.message),
  );
  assert.equal(messages.includes("Sitemap entry is missing loc"), true);
  assert.equal(messages.includes("Sitemap entry URL is invalid"), true);
  assert.equal(messages.includes("Sitemap lastmod is invalid"), true);
  assert.equal(messages.includes("Sitemap changefreq is invalid"), true);
  assert.equal(messages.includes("Sitemap priority is invalid"), true);
});

test("XML discovery requires exact names and namespaces", () => {
  const context = {
    runId: "run_namespace",
    requestId: "request_namespace",
    resourceId: "resource_namespace",
    requestedUrl: "https://example.com/source.xml",
    finalUrl: "https://example.com/source.xml",
    normalizedUrl: "https://example.com/source.xml",
    encoding: null,
    decodingWarnings: [],
    config: xmlConfig(),
  };
  for (const xml of [
    '<URLSET xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url/></URLSET>',
    '<urlset xmlns="https://example.com/not-sitemap"><url/></urlset>',
    '<feed xmlns="https://example.com/not-atom"><entry/></feed>',
  ]) {
    assert.equal(
      extractXmlResource({ ...context, xml }).xmlKind,
      "generic-xml",
    );
  }
  const atom = extractXmlResource({
    ...context,
    xml: '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Item</title><link href="/item"/></entry></feed>',
  });
  assert.equal(atom.xmlKind, "feed");
  assert.equal(atom.feedEntries[0].normalizedUrl, "https://example.com/item");
});

test("sitemap lexical values reject JavaScript-number and calendar shortcuts", () => {
  const resource = extractXmlResource({
    xml: `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url>
      <loc>https://example.com/item</loc><priority>0x1</priority>
      <lastmod>2026-02-30</lastmod><changefreq>DAILY</changefreq>
    </url></urlset>`,
    runId: "run_lexical",
    requestId: "request_lexical",
    resourceId: "resource_lexical",
    requestedUrl: "https://example.com/sitemap.xml",
    finalUrl: "https://example.com/sitemap.xml",
    normalizedUrl: "https://example.com/sitemap.xml",
    encoding: null,
    decodingWarnings: [],
    config: xmlConfig(),
  });
  const entry = resource.sitemapEntries[0];
  assert.equal(entry.priority, null);
  assert.equal(entry.changefreq, null);
  assert.equal(
    entry.warnings.filter((item) => item.message.includes("invalid")).length,
    3,
  );
});

test("run-wide sitemap entry limit truncates evidence deterministically", async () => {
  let origin = "";
  const fixture = await listen((request, response) => {
    if (request.url === "/sitemap.xml") {
      response.setHeader("content-type", "application/xml");
      response.end(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>${origin}/one</loc></url>
        <url><loc>${origin}/two</loc></url>
        <url><loc>${origin}/three</loc></url>
      </urlset>`);
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end(
      `<html><head><title>${request.url}</title></head><body>page</body></html>`,
    );
  });
  origin = fixture.origin;
  const root = await temporaryDirectory("site-crawler-sitemap-total-");
  try {
    const result = await new SiteCrawler(
      crawlInput(origin, {
        storage: { type: "filesystem", directory: root },
        sitemaps: {
          enabled: true,
          manual: [`${origin}/sitemap.xml`],
          discoverFromRobots: false,
          probeDefaultSitemap: false,
          enqueueEntries: false,
          maxTotalEntries: 2,
          maxEntriesPerSitemap: 10,
        },
      }),
    ).run();
    assert.equal(result.status, "stopped_by_limit");
    assert.equal(result.stats.sitemapEntriesDiscovered, 2);
    const entries = await readNdjson(
      path.join(result.outputDirectory, "sitemaps.ndjson"),
    );
    assert.equal(entries.length, 2);
    const xmlRecords = await readNdjson(
      path.join(result.outputDirectory, "xml.ndjson"),
    );
    assert.equal(
      xmlRecords[0].warnings.some((warning) =>
        /run-wide entry limit/u.test(warning.message),
      ),
      true,
    );
  } finally {
    await closeServer(fixture.server);
  }
});

test("sitemap file and index-depth limits stop further expansion", async () => {
  let origin = "";
  const requested = [];
  const fixture = await listen((request, response) => {
    requested.push(request.url);
    response.setHeader("content-type", "application/xml");
    if (request.url === "/root.xml") {
      response.end(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>${origin}/child-a.xml</loc></sitemap>
        <sitemap><loc>${origin}/child-b.xml</loc></sitemap>
      </sitemapindex>`);
      return;
    }
    if (request.url === "/child-a.xml") {
      response.end(
        `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin}/grandchild.xml</loc></sitemap></sitemapindex>`,
      );
      return;
    }
    response.end(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
    );
  });
  origin = fixture.origin;
  const root = await temporaryDirectory("site-crawler-sitemap-limits-");
  try {
    const result = await new SiteCrawler(
      crawlInput(origin, {
        storage: { type: "filesystem", directory: root },
        sitemaps: {
          enabled: true,
          manual: [`${origin}/root.xml`],
          discoverFromRobots: false,
          probeDefaultSitemap: false,
          enqueueEntries: false,
          maxSitemapFiles: 2,
          maxSitemapIndexDepth: 1,
        },
      }),
    ).run();
    assert.equal(result.status, "stopped_by_limit");
    assert.equal(requested.includes("/root.xml"), true);
    assert.equal(requested.includes("/child-a.xml"), true);
    assert.equal(requested.includes("/child-b.xml"), false);
    assert.equal(requested.includes("/grandchild.xml"), false);
    const skipped = await readNdjson(
      path.join(result.outputDirectory, "skipped.ndjson"),
    );
    assert.equal(
      skipped.some((record) => record.reason === "SITEMAP_LIMIT_EXCEEDED"),
      true,
    );
  } finally {
    await closeServer(fixture.server);
  }
});

test("recursive sitemap indexes are recorded but not scheduled again", async () => {
  let origin = "";
  let sitemapRequests = 0;
  const fixture = await listen((request, response) => {
    if (request.url === "/recursive.xml") {
      sitemapRequests += 1;
      response.setHeader("content-type", "application/xml");
      response.end(
        `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin}/recursive.xml</loc></sitemap></sitemapindex>`,
      );
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end("<html><body>seed</body></html>");
  });
  origin = fixture.origin;
  const root = await temporaryDirectory("site-crawler-sitemap-recursion-");
  try {
    const result = await new SiteCrawler(
      crawlInput(origin, {
        storage: { type: "filesystem", directory: root },
        sitemaps: {
          enabled: true,
          manual: [`${origin}/recursive.xml`],
          discoverFromRobots: false,
          probeDefaultSitemap: false,
        },
      }),
    ).run();
    assert.notEqual(result.status, "failed");
    assert.equal(sitemapRequests, 1);
    const entries = await readNdjson(
      path.join(result.outputDirectory, "sitemaps.ndjson"),
    );
    assert.equal(entries.length, 1);
    assert.equal(
      entries[0].warnings.some((warning) =>
        /Recursive sitemap index/u.test(warning.message),
      ),
      true,
    );
  } finally {
    await closeServer(fixture.server);
  }
});
