import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";
import { SiteCrawler } from "../dist/index.js";
import { CrawlIndex } from "../dist/query/public.js";
import {
  closeServer,
  crawlInput,
  listen,
  readNdjson,
  temporaryDirectory,
} from "./helpers.mjs";

test("HTML, JavaScript, CSS, and HTTP Link discovery share indexed evidence", async () => {
  const fixture = await listen((request, response) => {
    const url = request.url ?? "/";
    if (url === "/app.js") {
      response.setHeader("content-type", "application/javascript");
      response.end('fetch("/js-target"); import("/chunk.js")');
      return;
    }
    if (url === "/style.css") {
      response.setHeader("content-type", "text/css");
      response.end(
        '@import "/theme.css"; .hero { background: url("/hero.webp") }',
      );
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (url === "/") {
      response.setHeader("link", '</header-target>; rel="next"');
      response.end(`<!doctype html><html><head>
        <title>Root</title><link rel="stylesheet" href="/style.css">
        </head><body><script src="/app.js"></script>
        <video src="/movie.mp4" poster="/poster.webp"></video>
        <audio src="/sound.mp3"></audio></body></html>`);
      return;
    }
    response.end(
      `<html><head><title>${url}</title></head><body>${url}</body></html>`,
    );
  });
  const root = await temporaryDirectory("site-crawler-v08-discovery-");
  try {
    const result = await new SiteCrawler(
      crawlInput(fixture.origin, {
        storage: { type: "sqlite", directory: root },
        jsDiscovery: {
          enabled: true,
          mode: "hybrid",
          fetchScriptAssets: true,
          enqueueDiscoveredUrls: true,
        },
        cssDiscovery: {
          enabled: true,
          fetchStylesheets: true,
          enqueueDiscoveredUrls: true,
        },
      }),
    ).run();
    assert.notEqual(result.status, "failed");
    assert.equal(result.stats.javascriptResourcesParsed, 1);
    assert.equal(result.stats.cssStylesheetsParsed >= 1, true);
    assert.equal(result.stats.javascriptLinksExtracted >= 2, true);
    assert.equal(result.stats.cssLinksExtracted >= 2, true);
    assert.notEqual(result.outputDirectory, null);
    const index = new CrawlIndex(result.outputDirectory);
    try {
      assert.equal(index.resourcesByType("javascript").length, 1);
      assert.equal(index.resourcesByType("css").length >= 1, true);
      const links = index.outgoingLinks(`${fixture.origin}/`, 100);
      const sources = new Set(links.map((record) => record.data.source));
      assert.equal(sources.has("http-link-header"), true);
      assert.equal(sources.has("video[src]"), true);
      assert.equal(sources.has("audio[src]"), true);
    } finally {
      index.close();
    }
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rendered cookies flow back into the HTTP session", async () => {
  let cookieSeen = false;
  const fixture = await listen((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/rendered-target") {
      cookieSeen = request.headers.cookie === "rendered=yes";
      response.end("<html><body>target</body></html>");
      return;
    }
    response.end('<html><body><div id="root"></div></body></html>');
  });
  const renderer = {
    name: "fixture-renderer",
    version: "1",
    async render(request) {
      return {
        requestedUrl: request.url,
        finalUrl: request.url,
        html: '<html><body><a href="/rendered-target">target</a></body></html>',
        renderedAt: new Date().toISOString(),
        durationMs: 1,
        consoleErrors: [],
        pageErrors: [],
        networkErrors: [],
        screenshotPath: null,
        cookies: [
          {
            name: "rendered",
            value: "yes",
            domain: "127.0.0.1",
            path: "/",
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: "Lax",
          },
        ],
        warnings: [],
      };
    },
  };
  try {
    const result = await new SiteCrawler(
      crawlInput(fixture.origin, {
        session: { enabled: true },
        rendering: { mode: "always", maxRenderedPages: 1 },
      }),
      { renderer },
    ).run();
    assert.notEqual(result.status, "failed");
    assert.equal(result.stats.renderedPages, 1);
    assert.equal(cookieSeen, true);
  } finally {
    await closeServer(fixture.server);
  }
});

test("resource middleware can retain evidence while skipping parsing", async () => {
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("<html><head><title>skip</title></head><body></body></html>");
  });
  const root = await temporaryDirectory("site-crawler-v08-middleware-");
  try {
    const result = await new SiteCrawler(
      crawlInput(fixture.origin, {
        storage: { type: "filesystem", directory: root },
      }),
      {
        middlewares: {
          afterResource: [
            () => ({ kind: "skip-processing", reason: "evidence only" }),
          ],
        },
      },
    ).run();
    assert.equal(result.stats.resourcesRecorded, 1);
    assert.equal(result.stats.htmlPagesParsed, 0);
    assert.notEqual(result.outputDirectory, null);
    const resources = await readNdjson(
      `${result.outputDirectory}/resources.ndjson`,
    );
    assert.equal(resources.length, 1);
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});
