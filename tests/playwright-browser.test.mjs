import assert from "node:assert/strict";
import { test } from "node:test";
import { PlaywrightRenderAdapter } from "../dist/rendering/playwright/public.js";
import { closeServer, listen } from "./helpers.mjs";

const enabled = process.env.SITE_CRAWLER_RUN_BROWSER_TESTS === "1";
const policySafeFixture =
  process.env.SITE_CRAWLER_BROWSER_FIXTURE === "about-blank";

test(
  "Playwright adapter performs real browser navigation and executes JavaScript",
  { skip: !enabled, timeout: 40_000 },
  async () => {
    const fixture = policySafeFixture
      ? null
      : await listen((_request, response) => {
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(`<!doctype html><html><body><div id="app"></div><script>
      document.querySelector('#app').textContent = 'rendered-by-browser';
    </script></body></html>`);
        });
    const executablePath = process.env.SITE_CRAWLER_CHROMIUM_PATH;
    const adapter = new PlaywrightRenderAdapter({
      browser: "chromium",
      ...(executablePath === undefined ? {} : { executablePath }),
      launchArgs: ["--no-sandbox", "--disable-dev-shm-usage"],
      maxConcurrency: 1,
      launchTimeoutMs: 10_000,
      operationTimeoutMs: 25_000,
      closeTimeoutMs: 5_000,
      ...(policySafeFixture
        ? {
            initScripts: [
              `window.addEventListener("DOMContentLoaded", () => {
                document.body.innerHTML = '<div id="app">rendered-by-browser</div>';
              });`,
            ],
          }
        : {}),
    });
    const controller = new AbortController();
    const url = policySafeFixture ? "about:blank" : `${fixture.origin}/`;
    try {
      const page = await adapter.render(
        {
          url,
          requestId: "browser-fixture",
          timeoutMs: 10_000,
          signal: controller.signal,
          headers: {},
          cookies: [],
          waitUntil: "load",
        },
        {
          runId: "browser-run",
          userAgent: "site-crawler-browser-test",
          signal: controller.signal,
        },
      );
      assert.match(page.html, /rendered-by-browser/u);
      assert.equal(page.finalUrl, url);
      assert.equal(page.pageErrors.length, 0);
    } finally {
      await adapter.close();
      if (fixture !== null) await closeServer(fixture.server);
    }
  },
);
