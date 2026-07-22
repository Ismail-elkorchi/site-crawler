# Browser rendering

## Optional adapter

The base crawler can run without a browser. Browser support is exposed through `site-crawler/playwright`, which uses `playwright-core` and does not download a browser binary.

```ts
import { SiteCrawler } from "site-crawler";
import { PlaywrightRenderAdapter } from "site-crawler/playwright";

const renderer = new PlaywrightRenderAdapter({
  browser: "chromium",
  executablePath: "/usr/bin/chromium",
  maxConcurrency: 2,
  operationTimeoutMs: 45_000,
  closeTimeoutMs: 10_000,
  blockedResourceTypes: ["image", "media", "font"],
});

const crawler = new SiteCrawler(
  {
    seeds: ["https://example.com/app"],
    rendering: { mode: "auto", maxRenderedPages: 100 },
  },
  { renderer },
);
```

## Isolation and lifecycle

Each render uses an isolated browser context. The adapter owns browser startup, a concurrency semaphore, context creation, request routing, page observation, screenshots, cookie transfer, cancellation, and shutdown.

The crawler passes HTTP session cookies into the browser context. Cookies returned by the context are captured and written back to the HTTP session. Request headers and user agent are applied to the context.

Cancellation closes the active page and participates in the run-wide abort signal. Browser or renderer close failures affect the final run result.

The adapter also applies a referenced deadline to the complete render transaction and bounded deadlines to context and browser shutdown. These deadlines cover Playwright operations that can otherwise remain pending after an unexpected browser disconnect.

Browser processes are launched through Playwright `BrowserServer`. The adapter first requests a graceful server close and then uses the public server `kill()` operation if graceful shutdown exceeds its deadline. This makes process ownership explicit and prevents browser children from surviving a completed crawler run.

## Evidence

Rendered HTML enters the same extraction and discovery pipeline as raw HTTP HTML. The page record retains `htmlSource: "rendered"`, so consumers can compare source and rendered evidence without conflating them.

The adapter can preserve:

- final URL;
- serialized DOM HTML;
- render duration;
- console errors;
- page errors;
- failed network requests;
- screenshot path;
- returned cookies;
- warnings.

## Automatic rendering

`auto` mode can use low visible-text volume, absence of navigation, known framework-shell markers, and configured URL patterns. The decision is bounded by `maxRenderedPages`, navigation timeout, and extraction timeout.

Automatic signals are heuristics, not proof that a page requires JavaScript. Users can select `never`, `auto`, or `always`, and can supply URL-specific rules through configuration and middleware.

## Verification

`npm run test:browser` performs real browser startup, navigation, JavaScript execution, DOM serialization, and shutdown. CI installs a Playwright Chromium build. On a managed local Chromium installation that blocks every network URL by machine policy, the verifier uses an `about:blank` fixture and an initialization script without changing the machine policy.

Each browser-test attempt is supervised by a hard process deadline. A stalled attempt is terminated as a process group before retry, preventing orphaned browser processes from contaminating later release gates.
