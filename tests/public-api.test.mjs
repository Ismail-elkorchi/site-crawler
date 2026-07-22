import assert from "node:assert/strict";
import { test } from "node:test";

test("package root exposes only the stable runtime surface", async () => {
  const root = await import("site-crawler");
  assert.equal(typeof root.SiteCrawler, "function");
  assert.equal(typeof root.parseCrawlConfig, "function");
  assert.equal(typeof root.resolveConfig, "function");
  assert.equal(typeof root.validateConfig, "function");
  assert.equal(typeof root.CrawlEventHub, "function");
  assert.equal("Frontier" in root, false);
  assert.equal("RobotsService" in root, false);
  assert.equal("ScopePolicy" in root, false);
});

test("documented package subpaths are importable", async () => {
  const [
    config,
    events,
    adapters,
    schemas,
    experimental,
    playwright,
    storage,
    query,
    opentelemetry,
  ] = await Promise.all([
    import("site-crawler/config"),
    import("site-crawler/events"),
    import("site-crawler/adapters"),
    import("site-crawler/schemas"),
    import("site-crawler/experimental"),
    import("site-crawler/playwright"),
    import("site-crawler/storage"),
    import("site-crawler/query"),
    import("site-crawler/opentelemetry"),
  ]);
  assert.equal(typeof config.parseCrawlConfig, "function");
  assert.equal(typeof events.CrawlEventHub, "function");
  assert.deepEqual(Object.keys(adapters), []);
  assert.equal(typeof schemas.validatePersistentValue, "function");
  assert.equal(typeof schemas.schemaForId, "function");
  assert.equal(Array.isArray(schemas.persistentSchemas), true);
  assert.equal(typeof experimental.extractHtmlFacts, "function");
  assert.equal(typeof experimental.extractXmlResource, "function");
  assert.equal(typeof playwright.PlaywrightRenderAdapter, "function");
  assert.equal(typeof storage.SqliteResultStore, "function");
  assert.equal(typeof query.CrawlIndex, "function");
  assert.equal(typeof opentelemetry.createOpenTelemetryHooks, "function");
});
