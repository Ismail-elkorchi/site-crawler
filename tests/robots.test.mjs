import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRobotsTxt } from "../dist/robots/index.js";
import { crawlDelayFor, decisionForPath } from "../dist/robots/matcher.js";

const base = "https://example.com/robots.txt";

test("robots selects the longest matching user-agent token", () => {
  const policy = parseRobotsTxt(
    "User-agent: *\nDisallow: /global\n\nUser-agent: SiteCrawler\nDisallow: /specific\n",
    base,
  );
  assert.equal(
    decisionForPath(policy, "SiteCrawler/0.6", "/global").allowed,
    true,
  );
  assert.equal(
    decisionForPath(policy, "SiteCrawler/0.6", "/specific").allowed,
    false,
  );
});

test("robots supports wildcard and end-anchor matching", () => {
  const policy = parseRobotsTxt("User-agent: *\nDisallow: /*.pdf$\n", base);
  assert.equal(decisionForPath(policy, "crawler", "/file.pdf").allowed, false);
  assert.equal(
    decisionForPath(policy, "crawler", "/file.pdf?download=1").allowed,
    true,
  );
});

test("robots allow wins an equal-specificity tie", () => {
  const policy = parseRobotsTxt(
    "User-agent: *\nDisallow: /same\nAllow: /same\n",
    base,
  );
  assert.equal(decisionForPath(policy, "crawler", "/same").allowed, true);
});

test("empty disallow does not block crawling", () => {
  const policy = parseRobotsTxt("User-agent: *\nDisallow:\n", base);
  assert.equal(decisionForPath(policy, "crawler", "/anything").allowed, true);
});

test("robots preserves sitemap directives and crawl delay", () => {
  const policy = parseRobotsTxt(
    "Sitemap: /sitemap.xml\nUser-agent: *\nCrawl-delay: 2.5\n",
    base,
  );
  assert.deepEqual(policy.sitemaps, ["https://example.com/sitemap.xml"]);
  assert.equal(crawlDelayFor(policy, "crawler"), 2.5);
});

test("robots normalizes equivalent percent-encoded octets", () => {
  const policy = parseRobotsTxt(
    "User-agent: *\nDisallow: /caf%C3%A9\nAllow: /caf%C3%A9/menu\n",
    base,
  );
  assert.equal(decisionForPath(policy, "crawler", "/caf%C3%A9").allowed, false);
  assert.equal(decisionForPath(policy, "crawler", "/café").allowed, false);
  assert.equal(
    decisionForPath(policy, "crawler", "/caf%C3%A9/menu").allowed,
    true,
  );
});

test("robots does not decode reserved percent-encoded separators", () => {
  const policy = parseRobotsTxt(
    "User-agent: *\nDisallow: /private%2Farea\n",
    base,
  );
  assert.equal(
    decisionForPath(policy, "crawler", "/private%2farea").allowed,
    false,
  );
  assert.equal(
    decisionForPath(policy, "crawler", "/private/area").allowed,
    true,
  );
});

test("robots matching is Unicode-scalar safe", () => {
  const policy = parseRobotsTxt(
    "User-agent: *\nDisallow: /emoji/😀\nDisallow: /broken/\uD800\n",
    base,
  );
  assert.equal(decisionForPath(policy, "crawler", "/emoji/😀").allowed, false);
  assert.equal(
    decisionForPath(policy, "crawler", "/emoji/%F0%9F%98%80").allowed,
    false,
  );
  assert.doesNotThrow(() =>
    decisionForPath(policy, "crawler", "/broken/\uD800"),
  );
  assert.equal(
    decisionForPath(policy, "crawler", "/broken/%EF%BF%BD").allowed,
    false,
  );
});

test("robots seed-only fallback permits only the seed request", async () => {
  const { unavailable } = await import("../dist/robots/matcher.js");
  const policy = unavailable("seed-only");
  assert.equal(decisionForPath(policy, "crawler", "/", true).allowed, true);
  assert.equal(
    decisionForPath(policy, "crawler", "/next", false).allowed,
    false,
  );
});
