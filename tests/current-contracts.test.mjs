import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { parseCrawlConfig } from "../dist/index.js";
import {
  runtimeContracts,
  SITE_CRAWLER_SCHEMA_VERSION,
  validateContract,
} from "../dist/contracts/public.js";
import { parseRunManifest } from "../dist/crawler/resume-schema.js";
import { SiteCrawler } from "../dist/index.js";
import { schemaForId } from "../dist/schemas/public.js";
import { closeServer, listen, temporaryDirectory } from "./helpers.mjs";

test("public configuration accepts partial nested parser and throttle settings", () => {
  const config = parseCrawlConfig({
    seeds: ["https://example.com/"],
    parsing: {
      html: { maxDepth: 64 },
      xml: { maxDepth: 32 },
    },
    network: {
      autoThrottle: { enabled: false },
    },
  });
  assert.equal(config.parsing?.html?.maxDepth, 64);
  assert.equal(config.parsing?.xml?.maxDepth, 32);
  assert.equal(config.network?.autoThrottle?.enabled, false);
});

test("removed configuration aliases are rejected", () => {
  assert.throws(
    () =>
      parseCrawlConfig({
        seeds: ["https://example.com/"],
        limits: { maxRequests: 1 },
      }),
    /unknown field/i,
  );
  assert.throws(
    () =>
      parseCrawlConfig({
        seeds: ["https://example.com/"],
        storage: { resumePolicy: "strict" },
      }),
    /invalid/i,
  );
});

test("runtime contracts reject non-finite numbers", () => {
  const value = {
    schemaId: "site-crawler.evidenceReference",
    schemaVersion: 1,
    algorithm: "sha256",
    digest: "0".repeat(64),
    kind: "html",
    mediaType: "text/html",
    relativePath: `evidence/sha256/${"0".repeat(64)}`,
    createdAt: new Date(0).toISOString(),
    byteLength: Number.NaN,
  };
  assert.throws(() => validateContract("evidence-reference", value));
});

test("evidence contracts enforce capture variants and digest shape", () => {
  const base = {
    schemaId: "site-crawler.evidenceReference",
    schemaVersion: 1,
    algorithm: "sha256",
    digest: "0".repeat(64),
    kind: "html",
    mediaType: "text/html",
    relativePath: `evidence/sha256/${"0".repeat(64)}`,
    createdAt: new Date(0).toISOString(),
    byteLength: 4,
  };
  assert.throws(() =>
    validateContract("evidence-reference", {
      ...base,
      capture: { kind: "complete", sourceByteLength: 4, limitBytes: 4 },
    }),
  );
  assert.throws(() =>
    validateContract("evidence-reference", {
      ...base,
      capture: { kind: "truncated", sourceByteLength: 4, limitBytes: 4 },
    }),
  );
  assert.throws(() =>
    validateContract("evidence-reference", {
      ...base,
      digest: "A".repeat(64),
      capture: { kind: "complete", sourceByteLength: 4 },
    }),
  );
});

test("generated schemas preserve nested runtime constraints", () => {
  const schema = schemaForId("site-crawler.evidenceReference");
  assert.notEqual(schema, null);
  assert.equal(schema.jsonSchema.properties.digest.pattern, "^[0-9a-f]{64}$");
  assert.deepEqual(schema.jsonSchema.properties.kind.enum, [
    "html",
    "xml",
    "rendered-html",
  ]);
  assert.equal(schema.jsonSchema.properties.capture.oneOf.length, 2);
});

test("all current crawler record contracts use the current schema version", () => {
  for (const contract of runtimeContracts) {
    assert.equal(contract.schemaVersion, SITE_CRAWLER_SCHEMA_VERSION);
  }
});

test("resume accepts only the exact current manifest shape", async () => {
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      "<html><head><title>Current</title></head><body>ok</body></html>",
    );
  });
  const root = await temporaryDirectory("site-crawler-current-contract-");
  try {
    const result = await new SiteCrawler({
      seeds: [`${fixture.origin}/`],
      limits: { maxScheduledRequests: 1, maxFetchedResources: 1 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: { type: "filesystem", directory: root },
    }).run();
    assert.notEqual(result.outputDirectory, null);
    const manifestPath = path.join(result.outputDirectory, "manifest.json");
    const manifestText = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestText);
    assert.equal(
      parseRunManifest(manifestText).schemaVersion,
      SITE_CRAWLER_SCHEMA_VERSION,
    );
    manifest.schemaVersion = SITE_CRAWLER_SCHEMA_VERSION + 1;
    assert.throws(() => parseRunManifest(JSON.stringify(manifest)), /version/);
    manifest.schemaVersion = SITE_CRAWLER_SCHEMA_VERSION;
    manifest.unpublishedLegacyField = true;
    assert.throws(
      () => parseRunManifest(JSON.stringify(manifest)),
      /unknown fields/,
    );
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});
