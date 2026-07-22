import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SiteCrawler } from "../dist/index.js";
import { resolveConfig } from "../dist/config/public.js";
import {
  extractHtmlFacts,
  extractXmlResource,
  normalizeUrl,
} from "../dist/experimental/public.js";

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.equal(typeof address, "object");
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

test("normalizes HTTP URLs deterministically", () => {
  const result = normalizeUrl("/a#frag", "https://EXAMPLE.com:443/base/");
  assert.equal(result.ok, true);
  assert.equal(result.value.normalizedUrl, "https://example.com/a");
});

test("extracts HTML facts through html-parser", () => {
  const result = extractHtmlFacts(
    '<!doctype html><html lang="en"><head><title>Hello</title><meta name="description" content="World"><link rel="canonical" href="/canonical"></head><body><h1>Title</h1><a href="/next">Next</a></body></html>',
    "https://example.com/page",
    minimalConfig(),
  );
  assert.equal(result.facts.title?.value, "Hello");
  assert.equal(result.facts.metaDescription?.value, "World");
  assert.equal(
    result.facts.canonical?.normalizedUrl,
    "https://example.com/canonical",
  );
  assert.equal(
    result.links.some((link) => link.raw === "/next"),
    true,
  );
});

test("extracts sitemap entries through xml-parser", () => {
  const resource = extractXmlResource({
    xml: '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/a</loc><lastmod>2026-01-01</lastmod></url></urlset>',
    runId: "run_test",
    requestId: "req_test",
    resourceId: "res_test",
    requestedUrl: "https://example.com/sitemap.xml",
    finalUrl: "https://example.com/sitemap.xml",
    normalizedUrl: "https://example.com/sitemap.xml",
    encoding: null,
    decodingWarnings: [],
    config: minimalConfig(),
  });
  assert.equal(resource.xmlKind, "sitemap");
  assert.equal(
    resource.sitemapEntries[0].normalizedUrl,
    "https://example.com/a",
  );
});

test("crawls a local website with robots and sitemap discovery", async () => {
  const { server, origin } = await listen((req, res) => {
    if (req.url === "/robots.txt") {
      res.setHeader("content-type", "text/plain");
      res.end(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
      return;
    }
    if (req.url === "/sitemap.xml") {
      res.setHeader("content-type", "application/xml");
      res.end(
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/from-sitemap</loc></url></urlset>`,
      );
      return;
    }
    if (req.url === "/from-sitemap") {
      res.setHeader("content-type", "text/html");
      res.end(
        "<html><head><title>Sitemap</title></head><body>Sitemap page</body></html>",
      );
      return;
    }
    res.setHeader("content-type", "text/html");
    res.end(
      `<html><head><title>Home</title></head><body><a href="/next">Next</a></body></html>`,
    );
  });
  try {
    const out = await fs.mkdtemp(path.join(os.tmpdir(), "site-crawler-"));
    const crawler = new SiteCrawler({
      seeds: [`${origin}/`],
      limits: { maxScheduledRequests: 20, maxDepth: 3 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      storage: { type: "filesystem", directory: out },
      robots: { enabled: true },
      sitemaps: {
        enabled: true,
        discoverFromRobots: true,
        probeDefaultSitemap: false,
      },
    });
    const result = await crawler.run();
    assert.notEqual(result.status, "failed");
    assert.equal(result.stats.htmlPagesParsed >= 2, true);
    assert.equal(result.stats.sitemapEntriesDiscovered >= 1, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("uses a rendering adapter without bundling a browser engine", async () => {
  const { server, origin } = await listen((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(
      '<html><head><title>Shell</title></head><body><div id="app"></div></body></html>',
    );
  });
  try {
    const out = await fs.mkdtemp(
      path.join(os.tmpdir(), "site-crawler-render-"),
    );
    const renderer = {
      name: "fixture-renderer",
      version: "1.0.0",
      async render(request, context) {
        assert.equal(context.userAgent, "test-renderer");
        return {
          requestedUrl: request.url,
          finalUrl: request.url,
          html: '<html><head><title>Rendered</title></head><body><a href="/rendered-next">Rendered next</a></body></html>',
          renderedAt: new Date(0).toISOString(),
          durationMs: 1,
          cookies: [],
          warnings: [],
        };
      },
    };
    const crawler = new SiteCrawler(
      {
        seeds: [`${origin}/`],
        limits: { maxScheduledRequests: 5, maxDepth: 1 },
        network: { maxConcurrency: 1, maxConcurrencyPerOrigin: 1 },
        networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
        storage: { type: "filesystem", directory: out },
        robots: { enabled: false, userAgent: "test-renderer" },
        sitemaps: { enabled: false },
        rendering: { mode: "always", maxRenderedPages: 1 },
      },
      { renderer },
    );
    const result = await crawler.run();
    assert.notEqual(result.status, "failed");
    assert.equal(result.stats.renderedPages, 1);
    const pages = await readNdjson(
      path.join(result.outputDirectory, "pages.ndjson"),
    );
    assert.equal(
      pages.some(
        (page) =>
          page.htmlSource === "rendered" &&
          page.facts.title?.value === "Rendered",
      ),
      true,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function readNdjson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function minimalConfig() {
  return resolveConfig({
    seeds: ["https://example.com/"],
    robots: { enabled: false },
    sitemaps: { enabled: true },
    storage: { type: "memory" },
  });
}

test("discovers URLs from JavaScript assets when enabled", async () => {
  const { server, origin } = await listen((req, res) => {
    if (req.url === "/robots.txt") {
      res.setHeader("content-type", "text/plain");
      res.end("User-agent: *\nAllow: /\n");
      return;
    }
    if (req.url === "/app.js") {
      res.setHeader("content-type", "application/javascript");
      res.end('const route = "/from-js";');
      return;
    }
    if (req.url === "/from-js") {
      res.setHeader("content-type", "text/html");
      res.end(
        "<html><head><title>From JS</title></head><body>JS route</body></html>",
      );
      return;
    }
    res.setHeader("content-type", "text/html");
    res.end(
      '<html><head><title>Home</title></head><body><script src="/app.js"></script></body></html>',
    );
  });
  try {
    const out = await fs.mkdtemp(path.join(os.tmpdir(), "site-crawler-js-"));
    const crawler = new SiteCrawler({
      seeds: [`${origin}/`],
      limits: { maxScheduledRequests: 20, maxDepth: 3 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      storage: { type: "filesystem", directory: out },
      robots: { enabled: true },
      sitemaps: { enabled: false },
      jsDiscovery: {
        enabled: true,
        fetchScriptAssets: true,
        enqueueDiscoveredUrls: true,
      },
    });
    const result = await crawler.run();
    assert.notEqual(result.status, "failed");
    assert.equal(result.stats.javascriptLinksExtracted >= 1, true);
    assert.equal(result.stats.htmlPagesParsed >= 2, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("resumes a crawl from the durable filesystem frontier", async () => {
  const { server, origin } = await listen((req, res) => {
    if (req.url === "/robots.txt") {
      res.setHeader("content-type", "text/plain");
      res.end("User-agent: *\nAllow: /\n");
      return;
    }
    if (req.url === "/a" || req.url === "/b") {
      res.setHeader("content-type", "text/html");
      res.end(
        `<html><head><title>${req.url}</title></head><body>${req.url}</body></html>`,
      );
      return;
    }
    res.setHeader("content-type", "text/html");
    res.end(
      '<html><head><title>Home</title></head><body><a href="/a">A</a><a href="/b">B</a></body></html>',
    );
  });
  try {
    const out = await fs.mkdtemp(
      path.join(os.tmpdir(), "site-crawler-resume-"),
    );
    const first = new SiteCrawler(
      {
        seeds: [`${origin}/`],
        limits: { maxScheduledRequests: 20, maxDepth: 3 },
        network: { maxConcurrency: 1 },
        networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
        storage: { type: "filesystem", directory: out },
        robots: { enabled: true },
        sitemaps: { enabled: false },
      },
      {
        hooks: {
          onHtmlParsed(context, page) {
            if (page.finalUrl === `${origin}/`)
              context.abort("resume fixture stop");
          },
        },
      },
    );
    const firstResult = await first.run();
    assert.equal(firstResult.status, "aborted");
    assert.equal(typeof firstResult.outputDirectory, "string");

    const second = new SiteCrawler({
      seeds: [`${origin}/`],
      limits: { maxScheduledRequests: 20, maxDepth: 3 },
      network: { maxConcurrency: 1 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      storage: {
        type: "filesystem",
        resumeFrom: firstResult.outputDirectory,
        resumePolicy: "operational",
      },
      robots: { enabled: true },
      sitemaps: { enabled: false },
    });
    const secondResult = await second.run();
    assert.notEqual(secondResult.status, "failed");
    assert.equal(secondResult.stats.resumedRequests >= 1, true);
    assert.equal(secondResult.stats.htmlPagesParsed >= 1, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
