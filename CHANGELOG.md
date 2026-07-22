# Changelog

## Unreleased

- Updated the HTML and XML parsers to `0.2.0` using checksum-verified public npm artifacts.
- Separated hard-limit admission shutdown from explicit cancellation so an in-flight boundary response can finish.
- Made XML decoding, parsing, evidence, and replay consume one byte-exact source with structured failure and budget states.
- Made response-file streaming demand-driven and closed discarded retry and redirect bodies on every path.
- Replaced duplicate snapshot paths with validated content-addressed evidence references that state capture completeness.
- Enforced exact runtime contracts at persistent producer boundaries and deterministic HTML/XML replay projections.
- Enforced private run, cookie, cache, evidence, journal, database, screenshot, and operation-output paths.
- Corrected valid-link cap accounting, resume trap reservations, Unicode robots matching, XML vocabulary matching, JavaScript/XHR ranking, and CSS token discovery.
- Added public-registry lockfile, clean-install, package, browser, crash, schema, load, soak, and supply-chain qualification.

## 0.1.0

- Removed all unpublished migration and backward-compatibility code.
- Reset persistent records to numeric schema version `1` with a separate schema identity.
- Removed deprecated configuration and resource-field aliases.
- Removed unreachable modules and added source-graph reachability enforcement.
- Corrected nested public configuration input types.
- Made resume parsing current-format-only with exact and operational policies.
- Strengthened unknown-input validation and finite-number contracts.
- Added deterministic test-process termination verification.
- Bounded Playwright render, context-close, and browser-close operations.
- Made the Playwright adapter own a `BrowserServer` with bounded graceful close and force-kill fallback.
- Added browser-test process supervision with timed process-group cleanup and retries.
