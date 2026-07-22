# HTTP sessions and conditional cache

## Transport selection

`network.protocolPreference` accepts `auto`, `http1`, or `http2`. HTTP/2 is available for HTTPS origins. In `auto`, the crawler attempts HTTP/2 where appropriate and falls back to HTTP/1.1 when the failure is eligible for fallback.

The built-in transports connect to a network-safety-approved address while preserving the original HTTP authority and TLS server name. Resource records preserve negotiated protocol, remote address, DNS/connect/TLS/first-byte/body timings, wire bytes, HTTP-decoded bytes, and TLS facts when available.

## Response bodies

Small decoded bodies remain in memory. Larger bodies are written to a bounded private temporary file. File-backed streams read only in response to consumer demand. Every processor consumes the same `ResponseBody` abstraction, and temporary files are removed after processing, cancellation, retries, redirects, and failures.

The limits distinguish:

- bytes read from the transport;
- bytes after HTTP content decoding;
- bytes after file-level XML decompression such as `.xml.gz`.

The crawler enforces limits while streaming rather than after buffering the complete response.

## Sessions

Sessions are disabled by default. When enabled, a session can carry:

- initial cookies;
- response cookies;
- Basic credentials by origin;
- Bearer credentials by origin;
- cookies returned by a browser renderer.

Browser cookies are fed back into the HTTP cookie jar after rendering. Credentials and cookie values are redacted from persisted configuration and ordinary diagnostics.

Persistent cookies require durable filesystem-backed crawl storage. Relative cookie paths are resolved inside the individual run directory; absolute or escaping paths are rejected. Cookie and cache directories are forced to `0700` and files to `0600` on POSIX systems, including existing paths reopened by the crawler. Runs using sessions or authentication are marked sensitive in the manifest.

## Conditional cache

The optional HTTP cache stores ETag and Last-Modified validators. On a later request it can send `If-None-Match` or `If-Modified-Since`. A `304 Not Modified` response may reuse the stored body while preserving a factual `revalidated` cache status. Metadata records whether a body exists; its path is derived from the URL digest instead of trusting a persisted filesystem path, and its size is checked before reuse.

Cache reuse does not pretend that a new response body was downloaded. Resource facts retain the actual status, cache state, validators, and body provenance. Stale-on-error behavior is disabled by default and must be enabled explicitly.

The cache directory is operational for operational resume. Whether cache is enabled, whether bodies are stored, maximum body size, and stale-on-error behavior remain crawl-semantic.
