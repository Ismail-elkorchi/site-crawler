import { SITE_CRAWLER_VERSION } from "../dist/core/version.js";
import { benchmarkFrontier } from "./frontier.mjs";

const requestCount = Number(
  process.env.SITE_CRAWLER_FRONTIER_REQUESTS ?? "1000000",
);
if (!Number.isInteger(requestCount) || requestCount <= 0)
  throw new Error("SITE_CRAWLER_FRONTIER_REQUESTS must be a positive integer.");
const result = await benchmarkFrontier(requestCount);
process.stdout.write(
  `${JSON.stringify({ schemaId: "site-crawler.scaleBenchmark", schemaVersion: 1, crawlerVersion: SITE_CRAWLER_VERSION, result }, null, 2)}\n`,
);
