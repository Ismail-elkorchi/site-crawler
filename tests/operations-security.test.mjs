import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { SiteCrawler } from "../dist/index.js";
import {
  compactRun,
  exportRun,
  inspectRun,
  validateRun,
} from "../dist/operations/public.js";
import {
  auditRunSecurity,
  runSecurityDoctor,
} from "../dist/security/public.js";
import { closeServer, listen, temporaryDirectory } from "./helpers.mjs";

test("run operations inspect, validate, export, compact, and audit a completed run", async () => {
  const fixture = await listen((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("<html><body>operations</body></html>");
  });
  const root = await temporaryDirectory("site-crawler-v09-operations-");
  try {
    const result = await new SiteCrawler({
      seeds: [`${fixture.origin}/`],
      limits: { maxScheduledRequests: 1, maxFetchedResources: 1 },
      networkSafety: { allowLocalhost: true, allowPrivateNetworks: true },
      robots: { enabled: false },
      sitemaps: { enabled: false },
      storage: { type: "sqlite", directory: root, storeRawHtml: true },
    }).run();
    const inspection = await inspectRun(result.outputDirectory);
    assert.equal(inspection.runId, result.runId);
    assert.equal(inspection.counts.resource, 1);
    const validation = await validateRun(result.outputDirectory);
    assert.equal(validation.valid, true);
    const exported = await exportRun(
      result.outputDirectory,
      path.join(root, "export"),
    );
    assert.equal(exported.counts.resource, 1);
    const compacted = await compactRun(result.outputDirectory);
    assert.equal(
      compacted.databases.some((item) => item.fileName === "crawl.sqlite"),
      true,
    );
    const security = await auditRunSecurity(result.outputDirectory);
    assert.notEqual(security.status, "failed");
    assert.equal(
      runSecurityDoctor().issues.some(
        (item) => item.code === "UNSUPPORTED_NODE",
      ),
      Number(process.versions.node.split(".")[0]) < 24,
    );
  } finally {
    await closeServer(fixture.server);
    await fs.rm(root, { recursive: true, force: true });
  }
});
