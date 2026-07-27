# Crawling behavior

## Request lifecycle

A normalized URL is admitted once per crawl identity, then moves through pending, leased, and one terminal state: handled, failed, skipped, or cancelled. Lease ownership and expiry make abandoned work recoverable. Terminal transitions reject stale leases and duplicate completion.

The frontier supports priority, breadth-first, and depth-first order. Ready work is selected by origin before it is leased so workers do not hold requests while waiting for an origin delay.

Network delivery is at-least-once across a hard crash. The project does not claim exactly-once remote execution.

## Discovery

Discovery evidence records the raw candidate, resolved and normalized URLs, source, referrer, decision, and extraction evidence.

Sources include:

- HTML attributes, `srcset`, meta refresh, inline CSS, and `srcdoc`
- HTTP `Link` headers
- sitemap and feed entries
- JavaScript static candidates
- CSS imports and URLs
- redirects, seeds, hooks, and manual requests

Candidate caps count valid candidates, not malformed text. HTML names follow HTML case rules; XML sitemap and feed recognition remains namespace- and case-sensitive. Robots matching operates on Unicode scalar values and follows longest-match and allow-on-tie behavior.

## Fetching and decoding

Resource records distinguish wire bytes, HTTP-decoded bytes, and file-level XML decompression bytes. They also preserve response status, redirects, cache state, encoding evidence, timings, remote address, TLS facts, and protocol.

HTML decoding uses BOM, transport, and markup signals according to their precedence. XML parsing, raw evidence, and replay consume the same byte source, so a replay cannot silently parse a different representation from the captured one.

## Rendering

The base crawler does not launch a browser. Pass a `RenderAdapter` to enable rendering. The Playwright implementation is available from `@ismail-elkorchi/site-crawler/playwright` and uses a caller-installed Chromium executable.

Rendering modes are `never`, `auto`, and `always`. Auto mode can react to configured URL patterns and HTML shell signals. Browser operations and shutdown have explicit deadlines, and browser-created cookies flow back to the HTTP session.

## Middleware and hooks

Runtime extensions are passed separately from configuration:

```ts
const crawler = new SiteCrawler(config, {
  middlewares: {
    beforeRequest: [
      (_context, request) =>
        request.normalizedUrl.endsWith("/logout")
          ? {
              kind: "skip",
              reason: "USER_EXCLUDE_PATTERN",
              detail: "Avoid logout links",
            }
          : { kind: "continue" },
    ],
  },
  hooks: {
    onHtmlParsed(_context, page) {
      console.log(page.finalUrl);
    },
  },
  failureMode: "record",
});
```

Failure modes are:

- `record`: record the extension error and continue where possible.
- `fail-request`: fail the current request.
- `fail-run`: stop the crawl with a fatal extension error.

## Cancellation and finalization

Explicit cancellation aborts active work and terminalizes affected leases as cancelled. Limit shutdown is different: it stops admission without discarding the response that crossed the boundary.

During finalization, queued events and hooks are drained, auxiliary clients are closed, the final manifest and stats are persisted, and then `run-finished` is emitted. Failures during close or persistence change the final status instead of being ignored.
