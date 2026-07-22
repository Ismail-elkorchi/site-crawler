import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { SiteCrawler } from "../dist/index.js";
import { resolveConfig } from "../dist/config/public.js";
import { extractHtmlFacts } from "../dist/experimental/public.js";
import {
  closeServer,
  crawlInput,
  listen,
  readNdjson,
  temporaryDirectory,
} from "./helpers.mjs";

function extractionConfig() {
  return resolveConfig({
    seeds: ["https://example.com/root"],
    robots: { enabled: false },
    sitemaps: { enabled: false },
    storage: { type: "memory" },
  });
}

test("HTML headings preserve document order", () => {
  const extracted = extractHtmlFacts(
    "<main><h2>First</h2><section><h1>Second</h1><h3>Third</h3></section></main>",
    "https://example.com/root",
    extractionConfig(),
  );
  assert.deepEqual(
    extracted.facts.headings.map(({ level, text }) => ({ level, text })),
    [
      { level: 2, text: "First" },
      { level: 1, text: "Second" },
      { level: 3, text: "Third" },
    ],
  );
});

test("HTML uses the first valid base href and reports earlier invalid bases", () => {
  const extracted = extractHtmlFacts(
    '<head><base href="http://[invalid"><base href="/valid/"></head><body><a href="page">Page</a></body>',
    "https://example.com/root/index.html",
    extractionConfig(),
  );
  assert.equal(
    extracted.facts.baseHref?.normalizedUrl,
    "https://example.com/valid/",
  );
  assert.equal(
    extracted.facts.anchors[0]?.normalizedUrl,
    "https://example.com/valid/page",
  );
  assert.equal(
    extracted.facts.warnings.some(
      (warning) => warning.code === "BASE_HREF_IGNORED",
    ),
    true,
  );
});

test("HTML srcset preserves a comma-bearing data URL candidate", () => {
  const extracted = extractHtmlFacts(
    '<img srcset="data:image/svg+xml,%3Csvg%3E 1x, /large.png 2x">',
    "https://example.com/root",
    extractionConfig(),
  );
  assert.deepEqual(extracted.facts.images[0]?.srcset, [
    "data:image/svg+xml,%3Csvg%3E",
    "/large.png",
  ]);
});

test("HTML records response encoding and product-specific X-Robots-Tag facts", () => {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    robots: { enabled: false, productToken: "AuditBot" },
    sitemaps: { enabled: false },
    storage: { type: "memory" },
  });
  const encoding = {
    name: "windows-1252",
    source: "http-charset",
    replacementCharacters: 0,
  };
  const extracted = extractHtmlFacts(
    '<meta name="AuditBot" content="noindex"><main>Text</main>',
    "https://example.com/",
    config,
    { encoding, xRobotsTag: "AuditBot: noindex, nofollow" },
  );
  assert.deepEqual(extracted.facts.charset, encoding);
  assert.equal(extracted.facts.metaRobots.length, 1);
  assert.deepEqual(
    extracted.facts.xRobotsTag.flatMap((fact) => fact.directives),
    ["noindex", "nofollow"],
  );
});

test("HTML text limits are UTF-8 byte bounds with scalar-safe output", () => {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    robots: { enabled: false },
    sitemaps: { enabled: false },
    storage: { type: "memory" },
    parsing: { html: { maxTextBytes: 3 } },
  });
  const extracted = extractHtmlFacts(
    "<p>é😀z</p>",
    "https://example.com/",
    config,
  );

  assert.deepEqual(extracted.facts.visibleText, {
    text: "é",
    totalBytes: 7,
    truncated: true,
  });
  assert.deepEqual(extracted.facts.textContent, {
    text: "é",
    totalBytes: 7,
    truncated: true,
  });
});

test("HTML diagnostics preserve standard parse-error identities", () => {
  const extracted = extractHtmlFacts(
    "<!doctype><p>x",
    "https://example.com/",
    extractionConfig(),
  );
  assert.equal(
    extracted.facts.parserDiagnostics.some(
      (diagnostic) => diagnostic.code === "missing-doctype-name",
    ),
    true,
  );
  assert.equal(
    extracted.facts.parserDiagnostics.some(
      (diagnostic) => diagnostic.code === "PARSER_ERROR",
    ),
    false,
  );
  assert.equal(extracted.facts.parserBudgets.status, "within-limits");
});

test("HTML srcdoc discovery uses the typed fragment context", () => {
  const extracted = extractHtmlFacts(
    `<iframe srcdoc="&lt;a href='/inside'&gt;x&lt;/a&gt;"></iframe>`,
    "https://example.com/root",
    extractionConfig(),
  );
  assert.equal(
    extracted.links.some(
      (link) =>
        link.source === "iframe[srcdoc]" &&
        link.raw === "/inside" &&
        link.kind === "navigation",
    ),
    true,
  );
});

test("HTML resource discovery preserves SVG attribute namespaces", () => {
  const extracted = extractHtmlFacts(
    '<svg><use href="/current.svg#icon" xlink:href="/legacy.svg#icon"></use></svg>',
    "https://example.com/root",
    extractionConfig(),
  );
  assert.deepEqual(
    extracted.facts.resourceReferences
      .filter((reference) => reference.elementName === "use")
      .map((reference) => ({
        attributeName: reference.attributeName,
        rawUrl: reference.rawUrl,
      })),
    [
      { attributeName: "href", rawUrl: "/current.svg#icon" },
      { attributeName: "xlink:href", rawUrl: "/legacy.svg#icon" },
    ],
  );
});

test("HTML link truncation preserves discovered and omitted counts", async () => {
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("x-robots-tag", "noindex");
    response.end(
      '<html><head><title>Links</title></head><body><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></body></html>',
    );
  });
  const root = await temporaryDirectory("site-crawler-html-limit-");
  try {
    const result = await new SiteCrawler(
      crawlInput(fixture.origin, {
        limits: { maxDiscoveredLinksPerPage: 1, maxDepth: 0 },
        storage: { type: "filesystem", directory: root },
      }),
    ).run();
    const pages = await readNdjson(
      path.join(result.outputDirectory, "pages.ndjson"),
    );
    assert.equal(pages.length, 1);
    assert.equal(pages[0].discoveredOutgoingLinkCount, 3);
    assert.equal(pages[0].recordedOutgoingLinkCount, 1);
    assert.equal(pages[0].truncatedOutgoingLinkCount, 2);
    assert.equal(pages[0].facts.xRobotsTag.length, 1);
    assert.equal(
      pages[0].facts.warnings.some(
        (warning) => warning.code === "LINK_LIMIT_REACHED",
      ),
      true,
    );
  } finally {
    await closeServer(fixture.server);
  }
});
