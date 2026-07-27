import assert from "node:assert/strict";
import { test } from "node:test";

test("package root exposes only the stable runtime surface", async () => {
  const root = await import("@ismail-elkorchi/site-crawler");
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
    schemas,
    playwright,
    storage,
    query,
    opentelemetry,
    evidence,
    replay,
    diff,
    runs,
    operations,
    workers,
    security,
  ] = await Promise.all([
    import("@ismail-elkorchi/site-crawler/schemas"),
    import("@ismail-elkorchi/site-crawler/playwright"),
    import("@ismail-elkorchi/site-crawler/storage"),
    import("@ismail-elkorchi/site-crawler/query"),
    import("@ismail-elkorchi/site-crawler/opentelemetry"),
    import("@ismail-elkorchi/site-crawler/evidence"),
    import("@ismail-elkorchi/site-crawler/replay"),
    import("@ismail-elkorchi/site-crawler/diff"),
    import("@ismail-elkorchi/site-crawler/runs"),
    import("@ismail-elkorchi/site-crawler/operations"),
    import("@ismail-elkorchi/site-crawler/workers"),
    import("@ismail-elkorchi/site-crawler/security"),
  ]);
  assert.equal(typeof schemas.validatePersistentValue, "function");
  assert.equal(typeof schemas.schemaForId, "function");
  assert.equal(Array.isArray(schemas.persistentSchemas), true);
  assert.equal(Array.isArray(schemas.runtimeContracts), true);
  assert.equal(typeof playwright.PlaywrightRenderAdapter, "function");
  assert.equal(typeof storage.SqliteResultStore, "function");
  assert.equal(typeof query.CrawlIndex, "function");
  assert.equal(typeof opentelemetry.createOpenTelemetryHooks, "function");
  assert.equal(typeof evidence.createEvidenceBundle, "function");
  assert.equal(typeof replay.replayRun, "function");
  assert.equal(typeof diff.compareRuns, "function");
  assert.equal(typeof runs.openRunReader, "function");
  assert.equal(typeof operations.inspectRun, "function");
  assert.equal(typeof workers.SqliteWorkerCoordinator, "function");
  assert.equal(typeof security.auditRunSecurity, "function");
});
