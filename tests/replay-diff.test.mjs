import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";
import { SiteCrawler } from "../dist/index.js";
import { compareRuns } from "../dist/diff/public.js";
import { replayRun } from "../dist/replay/public.js";
import { closeServer, listen, temporaryDirectory } from "./helpers.mjs";

test("offline replay reproduces parser evidence and run comparison is deterministic", async () => {
  let revision = 1;
  const fixture = await listen((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/new" && revision === 1) {
      response.statusCode = 404;
      response.end("missing");
      return;
    }
    const title = revision === 1 ? "Before" : "After";
    const link = revision === 1 ? "/old" : "/new";
    response.end(
      `<html><head><title>${title}</title><meta name="description" content="${title}"></head><body><h1>${title}</h1><a href="${link}">${title}</a></body></html>`,
    );
  });
  const root = await temporaryDirectory("site-crawler-v09-diff-");
  try {
    const config = {
      seeds: [`${fixture.origin}/`],
      limits: { maxScheduledRequests: 2, maxFetchedResources: 2 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: { type: "filesystem", directory: root, storeRawHtml: true },
    };
    const before = await new SiteCrawler(config).run();
    revision = 2;
    const after = await new SiteCrawler(config).run();
    const replay = await replayRun(after.outputDirectory);
    assert.equal(replay.failed, 0);
    assert.equal(replay.missingEvidence, 0);
    assert.equal(replay.matched >= 1, true);
    const report = await compareRuns(
      before.outputDirectory,
      after.outputDirectory,
    );
    const kinds = new Set(report.changes.map((change) => change.kind));
    assert.equal(kinds.has("title-changed"), true);
    assert.equal(kinds.has("meta-description-changed"), true);
    assert.equal(kinds.has("headings-changed"), true);
    assert.equal(kinds.has("link-added"), true);
    assert.equal(kinds.has("link-removed"), true);
    const repeated = await compareRuns(
      before.outputDirectory,
      after.outputDirectory,
    );
    assert.deepEqual(
      report.changes.map(({ id, kind, key }) => ({ id, kind, key })),
      repeated.changes.map(({ id, kind, key }) => ({ id, kind, key })),
    );
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("run comparison is byte-stable when a detection timestamp is supplied", async () => {
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      "<html><head><title>Stable</title></head><body>stable</body></html>",
    );
  });
  const root = await temporaryDirectory("site-crawler-v09-stable-diff-");
  try {
    const input = {
      seeds: [`${fixture.origin}/`],
      limits: { maxScheduledRequests: 1, maxFetchedResources: 1 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: { type: "filesystem", directory: root },
    };
    const first = await new SiteCrawler(input).run();
    const second = await new SiteCrawler(input).run();
    const detectedAt = new Date(0).toISOString();
    const a = await compareRuns(first.outputDirectory, second.outputDirectory, {
      detectedAt,
    });
    const b = await compareRuns(first.outputDirectory, second.outputDirectory, {
      detectedAt,
    });
    assert.deepEqual(a, b);
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("HTML replay retains response directives and link-limit facts", async () => {
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("x-robots-tag", "noindex, nofollow");
    response.end(
      '<html><body><a href="/one">one</a><a href="/two">two</a></body></html>',
    );
  });
  const root = await temporaryDirectory("site-crawler-v09-replay-context-");
  try {
    const result = await new SiteCrawler({
      seeds: [`${fixture.origin}/`],
      limits: {
        maxScheduledRequests: 1,
        maxFetchedResources: 1,
        maxDiscoveredLinksPerPage: 1,
      },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: { type: "filesystem", directory: root, storeRawHtml: true },
    }).run();
    const replay = await replayRun(result.outputDirectory);
    assert.equal(replay.failed, 0);
    assert.equal(replay.changed, 0);
    assert.equal(replay.matched, 1);
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("feed replay is stable across repeated offline runs", async () => {
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "application/atom+xml; charset=utf-8");
    response.end(`<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Feed</title>
        <entry><title>Item</title><link href="${fixture.origin}/item"/></entry>
      </feed>`);
  });
  const root = await temporaryDirectory("site-crawler-v09-feed-replay-");
  try {
    const result = await new SiteCrawler({
      seeds: [`${fixture.origin}/feed.xml`],
      limits: { maxScheduledRequests: 1, maxFetchedResources: 1 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: { type: "filesystem", directory: root, storeRawXml: true },
    }).run();
    const first = await replayRun(result.outputDirectory);
    const second = await replayRun(result.outputDirectory);
    assert.equal(first.failed, 0);
    assert.equal(first.changed, 0);
    assert.deepEqual(
      first.items.map(
        ({ evidenceDigest, previousHash, replayedHash, status }) => ({
          evidenceDigest,
          previousHash,
          replayedHash,
          status,
        }),
      ),
      second.items.map(
        ({ evidenceDigest, previousHash, replayedHash, status }) => ({
          evidenceDigest,
          previousHash,
          replayedHash,
          status,
        }),
      ),
    );
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});
