import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { SiteCrawler } from "../dist/index.js";
import {
  closeServer,
  crawlInput,
  listen,
  readJson,
  readNdjson,
  temporaryDirectory,
} from "./helpers.mjs";

async function simpleServer() {
  return await listen((request, response) => {
    if (request.url === "/sitemap.xml") {
      response.setHeader("content-type", "application/xml");
      response.end(
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
      );
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end(
      "<html><head><title>Page</title></head><body>Page</body></html>",
    );
  });
}

test("crawls a file-compressed sitemap and records decoded XML size", async () => {
  let origin = "";
  const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!--${"x".repeat(5_000)}--><url><loc>PLACEHOLDER/from-gzip</loc></url></urlset>`;
  const fixture = await listen((request, response) => {
    if (request.url === "/sitemap.xml.gz") {
      const body = gzipSync(Buffer.from(xml.replace("PLACEHOLDER", origin)));
      response.setHeader("content-type", "application/gzip");
      response.setHeader("content-length", body.byteLength);
      response.end(body);
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end(
      `<html><head><title>${request.url}</title></head><body>${request.url}</body></html>`,
    );
  });
  origin = fixture.origin;
  const root = await temporaryDirectory("site-crawler-gzip-sitemap-");
  try {
    const crawler = new SiteCrawler(
      crawlInput(origin, {
        storage: { type: "filesystem", directory: root },
        sitemaps: {
          enabled: true,
          manual: [`${origin}/sitemap.xml.gz`],
          discoverFromRobots: false,
          probeDefaultSitemap: false,
          enqueueEntries: true,
        },
      }),
    );
    const result = await crawler.run();
    assert.notEqual(result.status, "failed");
    assert.equal(result.stats.sitemapEntriesDiscovered, 1);
    assert.equal(result.stats.htmlPagesParsed >= 2, true);
    const resources = await readNdjson(
      path.join(result.outputDirectory, "resources.ndjson"),
    );
    const sitemap = resources.find(
      (resource) => resource.resourceType === "sitemap",
    );
    assert.notEqual(sitemap, undefined);
    assert.equal(
      sitemap.fileDecodedBytesRead,
      Buffer.byteLength(xml.replace("PLACEHOLDER", origin)),
    );
    assert.equal(sitemap.wireBytesRead < sitemap.fileDecodedBytesRead, true);
  } finally {
    await closeServer(fixture.server);
  }
});

test("raw HTML and XML snapshots are written only when enabled", async () => {
  const fixture = await simpleServer();
  const enabledRoot = await temporaryDirectory("site-crawler-snapshots-on-");
  const disabledRoot = await temporaryDirectory("site-crawler-snapshots-off-");
  try {
    const enabled = await new SiteCrawler(
      crawlInput(fixture.origin, {
        storage: {
          type: "filesystem",
          directory: enabledRoot,
          storeRawHtml: true,
          storeRawXml: true,
        },
        sitemaps: {
          enabled: true,
          manual: [`${fixture.origin}/sitemap.xml`],
          discoverFromRobots: false,
          probeDefaultSitemap: false,
        },
      }),
    ).run();
    const manifest = await readJson(
      path.join(enabled.outputDirectory, "manifest.json"),
    );
    assert.equal(manifest.rawSnapshotsEnabled, true);
    const evidenceObjects = await fs.readdir(
      path.join(enabled.outputDirectory, "evidence", "sha256"),
    );
    assert.equal(evidenceObjects.length >= 2, true);
    const evidenceAssociations = await fs.readFile(
      path.join(enabled.outputDirectory, "evidence.ndjson"),
      "utf8",
    );
    assert.equal(evidenceAssociations.includes('"kind":"html"'), true);
    assert.equal(evidenceAssociations.includes('"kind":"xml"'), true);

    const disabled = await new SiteCrawler(
      crawlInput(fixture.origin, {
        storage: { type: "filesystem", directory: disabledRoot },
      }),
    ).run();
    const disabledManifest = await readJson(
      path.join(disabled.outputDirectory, "manifest.json"),
    );
    assert.equal(disabledManifest.rawSnapshotsEnabled, false);
    await assert.rejects(
      async () =>
        await fs.stat(path.join(disabled.outputDirectory, "evidence")),
      (error) =>
        error instanceof Error && "code" in error && error.code === "ENOENT",
    );
  } finally {
    await closeServer(fixture.server);
  }
});

test("exact resume rejects semantic configuration changes", async () => {
  const fixture = await simpleServer();
  const root = await temporaryDirectory("site-crawler-resume-strict-");
  try {
    const first = await new SiteCrawler(
      crawlInput(fixture.origin, {
        storage: { type: "filesystem", directory: root },
      }),
    ).run();
    assert.throws(
      () =>
        new SiteCrawler(
          crawlInput(fixture.origin, {
            limits: { maxDepth: 2 },
            storage: {
              type: "filesystem",
              resumeFrom: first.outputDirectory,
              resumePolicy: "exact",
            },
          }),
        ),
      /Resume configuration mismatch/u,
    );
  } finally {
    await closeServer(fixture.server);
  }
});

test("operational resume preserves run identity and terminal records", async () => {
  const fixture = await simpleServer();
  const root = await temporaryDirectory("site-crawler-resume-operational-");
  try {
    const first = await new SiteCrawler(
      crawlInput(fixture.origin, {
        network: { maxConcurrency: 1 },
        storage: { type: "filesystem", directory: root },
      }),
    ).run();
    const firstManifest = await readJson(
      path.join(first.outputDirectory, "manifest.json"),
    );
    const second = await new SiteCrawler(
      crawlInput(fixture.origin, {
        network: { maxConcurrency: 4 },
        storage: {
          type: "filesystem",
          resumeFrom: first.outputDirectory,
          resumePolicy: "operational",
          writeBufferSize: 1,
        },
      }),
    ).run();
    const secondManifest = await readJson(
      path.join(second.outputDirectory, "manifest.json"),
    );
    assert.equal(second.runId, first.runId);
    assert.equal(secondManifest.startedAt, firstManifest.startedAt);
    const states = await readNdjson(
      path.join(second.outputDirectory, "request-states.ndjson"),
    );
    const terminalCounts = new Map();
    for (const state of states) {
      if (!["handled", "failed", "skipped"].includes(state.state)) continue;
      terminalCounts.set(
        state.requestId,
        (terminalCounts.get(state.requestId) ?? 0) + 1,
      );
    }
    assert.equal(
      [...terminalCounts.values()].every((count) => count === 1),
      true,
    );
  } finally {
    await closeServer(fixture.server);
  }
});

for (const expectation of [
  { mode: "record", status: "completed", failed: 0 },
  { mode: "fail-request", status: "partial", failed: 1 },
  { mode: "fail-run", status: "failed", failed: 1 },
]) {
  test(`extension failure mode '${expectation.mode}' has explicit run semantics`, async () => {
    const fixture = await simpleServer();
    try {
      const result = await new SiteCrawler(crawlInput(fixture.origin), {
        failureMode: expectation.mode,
        hooks: {
          onHtmlParsed() {
            throw new Error("extension fixture failure");
          },
        },
      }).run();
      assert.equal(result.status, expectation.status);
      assert.equal(result.stats.requestsFailed, expectation.failed);
      if (expectation.mode === "fail-run") {
        assert.equal(result.fatalError.code, "EXTENSION_ERROR");
      }
    } finally {
      await closeServer(fixture.server);
    }
  });
}
