import assert from "node:assert/strict";
import { test } from "node:test";
import { FrontierJournal } from "../dist/frontier/journal.js";
import { resetFaultCounters } from "../dist/faults/injector.js";
import { normalizeUrl } from "../dist/url/index.js";
import { parseRobotsTxt } from "../dist/robots/parser.js";

test("fault injection interrupts journal transitions without hiding the point", async () => {
  const journal = new FrontierJournal(null, false);
  process.env.SITE_CRAWLER_FAULT_POINT = "before-journal-append";
  process.env.SITE_CRAWLER_FAULT_MODE = "throw";
  resetFaultCounters();
  try {
    await assert.rejects(
      journal.append({
        schemaId: "site-crawler.frontierJournal",
        schemaVersion: 1,
        type: "released",
        requestId: "request-1",
        leaseId: "lease-1",
        reason: "fixture",
        createdAt: new Date().toISOString(),
      }),
      /Injected fault/u,
    );
  } finally {
    delete process.env.SITE_CRAWLER_FAULT_POINT;
    delete process.env.SITE_CRAWLER_FAULT_MODE;
    resetFaultCounters();
    await journal.close();
  }
});

test("deterministic fuzz corpus does not escape URL and robots boundaries", () => {
  let state = 0x9e3779b9;
  for (let index = 0; index < 2_000; index += 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const token = state.toString(36);
    const raw =
      index % 3 === 0 ? `/${token}?q=${token}` : `https://example.com/${token}`;
    const normalized = normalizeUrl(raw, "https://example.com/base");
    assert.equal(normalized.ok, true);
    const robots = parseRobotsTxt(
      `User-agent: *\nDisallow: /${token.slice(0, 2)}*\nAllow: /${token}\n`,
      "https://example.com/robots.txt",
    );
    assert.equal(Array.isArray(robots.groups), true);
  }
});
