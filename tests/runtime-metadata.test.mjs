import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { SiteCrawler } from "../dist/index.js";
import {
  closeServer,
  listen,
  readJson,
  temporaryDirectory,
} from "./helpers.mjs";

test("manifest records runtime backends, cache, renderer, and sensitivity", async () => {
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("<html><body>ok</body></html>");
  });
  const root = await temporaryDirectory("site-crawler-v08-manifest-");
  const renderer = {
    name: "fixture-renderer",
    version: "2.1.0",
    async render() {
      throw new Error("Rendering is disabled for this test.");
    },
  };
  try {
    const result = await new SiteCrawler(
      {
        seeds: [`${fixture.origin}/`],
        limits: {
          maxScheduledRequests: 2,
          maxFetchedResources: 2,
        },
        networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
        network: { protocolPreference: "http1" },
        robots: { enabled: false },
        sitemaps: { enabled: false },
        session: { enabled: true },
        httpCache: { enabled: true, directory: path.join(root, "cache") },
        storage: { type: "sqlite", directory: root },
      },
      { renderer },
    ).run();
    assert.equal(result.status, "completed");
    const manifest = await readJson(
      path.join(result.outputDirectory, "manifest.json"),
    );
    assert.equal(manifest.crawlerVersion, "0.1.0");
    assert.equal(manifest.schemaId, "site-crawler.runManifest");
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.runtime.resultStorage, "sqlite");
    assert.equal(manifest.runtime.frontierBackend, "sqlite");
    assert.equal(manifest.runtime.httpProtocolPreference, "http1");
    assert.equal(manifest.runtime.httpCacheEnabled, true);
    assert.equal(manifest.runtime.sessionEnabled, true);
    assert.equal(manifest.runtime.persistedCookies, false);
    assert.deepEqual(manifest.runtime.renderer, {
      name: "fixture-renderer",
      version: "2.1.0",
    });
    assert.equal(manifest.sensitive, true);
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("persistent cookie files are isolated inside each run directory", async () => {
  const observedCookies = [];
  const fixture = await listen((request, response) => {
    observedCookies.push(request.headers.cookie ?? null);
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/first")
      response.setHeader("set-cookie", "token=first; Path=/");
    response.end("<html><body>ok</body></html>");
  });
  const root = await temporaryDirectory("site-crawler-v08-cookies-");
  try {
    const common = {
      limits: { maxScheduledRequests: 1, maxFetchedResources: 1 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      session: { enabled: true, persistCookies: true },
      storage: { type: "filesystem", directory: root },
    };
    const first = await new SiteCrawler({
      ...common,
      seeds: [`${fixture.origin}/first`],
    }).run();
    const second = await new SiteCrawler({
      ...common,
      seeds: [`${fixture.origin}/second`],
    }).run();
    assert.notEqual(first.outputDirectory, second.outputDirectory);
    const firstCookie = path.join(
      first.outputDirectory,
      "session",
      "cookies.json",
    );
    const secondCookie = path.join(
      second.outputDirectory,
      "session",
      "cookies.json",
    );
    assert.equal(await exists(firstCookie), true);
    assert.equal(await exists(secondCookie), true);
    assert.equal(
      path.relative(first.outputDirectory, firstCookie).startsWith(".."),
      false,
    );
    assert.equal(
      path.relative(second.outputDirectory, secondCookie).startsWith(".."),
      false,
    );
    assert.equal(observedCookies[0], null);
    assert.equal(observedCookies[1], null);
    const firstJar = await fs.readFile(firstCookie, "utf8");
    const secondJar = await fs.readFile(secondCookie, "utf8");
    assert.match(firstJar, /token/u);
    assert.doesNotMatch(secondJar, /token/u);
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
