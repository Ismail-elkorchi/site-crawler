# Evidence, replay, and differential crawling

## Content-addressed evidence

HTML and XML source evidence stores the exact bounded response bytes by SHA-256 digest. Multiple requests that observed identical bytes share one immutable object. Request-to-object associations remain separate from the object itself.

Each reference records its media type, byte length, and whether capture is complete or truncated. Complete evidence records the original source length; replay rejects incomplete input. Evidence storage provides deterministic paths, optional gzip compression, bounded decompression, path-containment checks, hash verification, immutable object semantics, and bundle manifests.

Evidence is disabled unless configured. Authenticated runs and bundles containing protected pages must be treated as sensitive data.

## Evidence bundles

`createEvidenceBundle()` collects referenced evidence, writes a deterministic manifest, and optionally compresses objects. `verifyEvidenceBundle()` validates path containment, object existence, byte limits, and SHA-256 digests.

A bundle is evidence, not an executable archive. Bundle metadata is never trusted as an unchecked filesystem path.

## Offline replay

`replayRun()` decodes and reprocesses stored HTML and XML evidence through the same byte path used during crawling, without network access. Replay records crawler and parser versions, the exact evidence digest, original facts, replayed facts, and matched, changed, missing-evidence, or failed status. Observation timestamps are excluded from semantic comparison; parser diagnostics, resource warnings, response robots directives, encoding, and deterministic extracted facts remain in it.

Replay supports parser upgrades, regression diagnosis, and reproducible bug reports. Rendered pages are replayed from captured HTML bytes; the crawler does not claim deterministic browser execution.

## Differential crawling

`compareRuns()` emits factual changes between completed runs, including resource or page appearance, disappearance, status, final URL, redirect chain, title, metadata, canonical, headings, language, links, sitemap membership, robots policy, and body or visible-text hashes.

Change ordering is deterministic. A fixed detection timestamp may be supplied when byte-stable report serialization is required.

The comparator does not assign SEO severity or prescribe remediation.
