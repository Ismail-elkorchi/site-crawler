import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveConfig } from "../dist/config/index.js";
import { discoverCssUrls } from "../dist/css/index.js";
import { discoverJavascriptUrls } from "../dist/javascript/index.js";

test("AST JavaScript and CSS discovery preserve extraction evidence", () => {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    jsDiscovery: { enabled: true, mode: "ast" },
    cssDiscovery: { enabled: true },
    robots: { enabled: false },
    sitemaps: { enabled: false },
    storage: { type: "memory" },
  });
  const javascript = discoverJavascriptUrls(
    'fetch("/api/items"); import("/chunks/view.js"); //# sourceMappingURL=app.js.map',
    config,
  );
  const css = discoverCssUrls(
    '@import url("/theme.css"); .hero { background: url(/hero.webp) }',
    config,
  );
  assert.equal(
    javascript.some((item) => item.rawUrl === "/api/items"),
    true,
  );
  assert.equal(
    javascript.some((item) => item.rawUrl === "/chunks/view.js"),
    true,
  );
  assert.equal(
    javascript.some((item) => item.method === "source-map"),
    true,
  );
  assert.equal(
    javascript.every((item) => item.offset === null || item.offset >= 0),
    true,
  );
  assert.equal(
    css.some((item) => item.rawUrl === "/theme.css"),
    true,
  );
  assert.equal(
    css.some((item) => item.rawUrl === "/hero.webp"),
    true,
  );
});

test("JavaScript ranking retains later call evidence and proves XHR receivers", () => {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    jsDiscovery: { enabled: true, mode: "ast", maxUrlsPerScript: 2 },
    robots: { enabled: false },
    sitemaps: { enabled: false },
    storage: { type: "memory" },
  });
  const discovered = discoverJavascriptUrls(
    `"/low-one"; "/low-two";
     window.open("/window"); arbitrary.open("GET", "/arbitrary");
     const request = new XMLHttpRequest(); request["open"]("GET", "/xhr");
     fetch("/high");`,
    config,
  );
  assert.deepEqual(
    discovered.map(({ rawUrl, method }) => ({ rawUrl, method })),
    [
      { rawUrl: "/xhr", method: "xhr-open" },
      { rawUrl: "/high", method: "fetch-call" },
    ],
  );
  const wider = discoverJavascriptUrls(
    'window.open("/window"); arbitrary.open("GET", "/arbitrary");',
    resolveConfig({
      seeds: ["https://example.com/"],
      jsDiscovery: { enabled: true, mode: "ast", maxUrlsPerScript: 10 },
      robots: { enabled: false },
      sitemaps: { enabled: false },
    }),
  );
  assert.equal(
    wider.some((item) => item.method === "xhr-open"),
    false,
  );
});

test("CSS discovery recognizes tokens rather than substrings", () => {
  const config = resolveConfig({
    seeds: ["https://example.com/"],
    cssDiscovery: { enabled: true, maxUrlsPerStylesheet: 10 },
    robots: { enabled: false },
    sitemaps: { enabled: false },
  });
  const discovered = discoverCssUrls(
    `.myurl { content: "url('/string')"; }
     @important "/not-import.css";
     @\\69mport "/escaped-import.css";
     .hero { background: u\\72l("/escaped-url.webp") }
     .bad { background: url("/unterminated" }`,
    config,
  );
  assert.deepEqual(
    discovered.map(({ rawUrl, method }) => ({ rawUrl, method })),
    [
      { rawUrl: "/escaped-import.css", method: "import" },
      { rawUrl: "/escaped-url.webp", method: "url" },
    ],
  );
});
