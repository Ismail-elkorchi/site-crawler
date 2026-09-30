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

## Request failures and empty crawls

DNS resolution failures are operational `DNS_ERROR` failures, not network-safety
policy rejections. DNS preflight and HTTP attempts share `network.retries` and
backoff. Exhausted DNS failures increment `requestsFailed` and
`requestsTransportFailed`; they do not increment `requestsPolicySkipped` or
`networkSafetyRejectedUrls`. Private/blocked addresses still produce policy skips,
without transport access. Redirect target DNS failures also retain `DNS_ERROR`
and retryability instead of being counted as blocked redirects; genuine redirect
policy rejections remain `REDIRECT_TARGET_REJECTED`. Custom redirect deciders
return `rejectionKind: "dns" | "policy" | null`. Cancellation during DNS resolution or retry backoff
cancels the request rather than failing it.

The current HTTP dependency exposes DNS failures without the underlying resolver
error code, so the crawler applies the same bounded DNS retry policy to temporary
and persistent failures. Its configured DNS cache also retains negative answers:
a retry before cache expiry may reuse a failed answer. A retry therefore does not
guarantee a fresh DNS lookup. The crawler preserves `networkSafety.dnsCacheTtlMs`
and does not bypass address checks or replace the shared cache.

A frontier-exhausted run with request failures and no fetched resources is
`failed`, with `fatalError: null` unless a separate fatal error occurred. A run
with both fetched resources and failed requests is `partial`. A run that only
skips URLs by policy remains `completed`. `summary.md` reports transport failures,
policy skips, safety rejections, cancellations and retries, and explicitly
explains zero-fetch outcomes. `errors.ndjson` and `skipped.ndjson` (when enabled)
contain per-request failure and rejection details.
