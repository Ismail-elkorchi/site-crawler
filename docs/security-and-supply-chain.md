# Security and supply chain

## Crawl security

The built-in model covers protocol restrictions, special-purpose IP ranges, DNS answer inspection, approved-address binding, redirect revalidation, response and parser budgets, DTD and external-entity restrictions, run and evidence path containment, secret redaction, authenticated-run sensitivity, extension timeouts, and browser cancellation and resource blocking.

These controls reduce risk but do not make arbitrary extensions, browser binaries, proxies, credentials, or captured content trustworthy.

## Fuzz and crash verification

Deterministic fuzz fixtures cover URL normalization, robots parsing, malformed persistent data, and boundary behavior. Fault injection can interrupt journal append, lease, fetch, terminal transition, statistics and manifest writes, and storage close.

Crash verification restarts the run and checks journal validity, lease recovery, terminal-state idempotence, and metadata consistency.

## Supply-chain metadata

Release metadata includes a CycloneDX SBOM, license inventory, package-lock digest, source/schema/API digests, source release manifest, provenance statement, and archive checksums.

The package-consumer gate builds a tarball, stages sanitized local copies of installed runtime dependencies, installs fully offline with lifecycle scripts disabled, verifies all documented subpaths, type-checks a strict external consumer, and executes the installed CLI.

Generated metadata is evidence of the local build. Cryptographic signing depends on the publication environment and is not fabricated by repository tooling.
