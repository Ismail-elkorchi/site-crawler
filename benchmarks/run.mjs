import { SITE_CRAWLER_VERSION } from "../dist/core/version.js";
import { benchmarkFrontier } from "./frontier.mjs";
import { benchmarkHttp2 } from "./http2.mjs";
import { benchmarkMultiOrigin } from "./multi-origin.mjs";
import { benchmarkSitemap } from "./sitemap.mjs";

const startedAt = new Date().toISOString();
const results = [];
await runBenchmark("sqlite-frontier", async () => await benchmarkFrontier());
await runBenchmark("sitemap-document", () => benchmarkSitemap());
await runBenchmark(
  "multi-origin-crawl",
  async () => await benchmarkMultiOrigin(),
);
await runBenchmark("http2-multiplexing", async () => await benchmarkHttp2());
const report = {
  schemaId: "site-crawler.benchmark",
  schemaVersion: 1,
  crawlerVersion: SITE_CRAWLER_VERSION,
  nodeVersion: process.version,
  platform: process.platform,
  architecture: process.arch,
  startedAt,
  finishedAt: new Date().toISOString(),
  results,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

async function runBenchmark(name, execute) {
  process.stderr.write(`[benchmark] ${name} started\n`);
  const result = await execute();
  results.push(result);
  process.stderr.write(`[benchmark] ${name} completed\n`);
}
