import path from "node:path";
import { FrontierJournal } from "../dist/frontier/journal.js";
import { parseCrawlRequest } from "../dist/requests/parse.js";

const [directory, point] = process.argv.slice(2);
if (directory === undefined || point === undefined) {
  throw new Error("Crash fixture arguments are missing.");
}
const now = new Date().toISOString();
const request = parseCrawlRequest({
  schemaId: "site-crawler.request",
  schemaVersion: 1,
  id: "request-fixture",
  uniqueKey: "https://example.com/",
  rawUrl: "https://example.com/",
  resolvedUrl: "https://example.com/",
  normalizedUrl: "https://example.com/",
  referrerUrl: null,
  source: "seed",
  seedUrl: "https://example.com/",
  seedLabel: null,
  depth: 0,
  priority: 0,
  method: "GET",
  headers: {},
  renderPolicy: "never",
  retryCount: 0,
  maxRetries: 0,
  sitemapIndexDepth: 0,
  sitemapAncestors: [],
  createdAt: now,
  updatedAt: now,
  userData: {},
});
const journal = new FrontierJournal(
  path.join(directory, "frontier.journal.ndjson"),
  true,
);
await journal.load();
await journal.append({
  schemaId: "site-crawler.frontierJournal",
  schemaVersion: 1,
  type: "enqueued",
  request,
  createdAt: now,
});
await journal.append({
  schemaId: "site-crawler.frontierJournal",
  schemaVersion: 1,
  type: "leased",
  requestId: request.id,
  leaseId: "lease-fixture",
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
  createdAt: now,
});
process.env.SITE_CRAWLER_FAULT_POINT = point;
process.env.SITE_CRAWLER_FAULT_MODE = "exit";
await journal.append({
  schemaId: "site-crawler.frontierJournal",
  schemaVersion: 1,
  type: "released",
  requestId: request.id,
  leaseId: "lease-fixture",
  reason: "crash fixture",
  createdAt: new Date().toISOString(),
});
await journal.close();
