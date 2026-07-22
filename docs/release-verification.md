# Release verification

A v0.9 source release must pass from both the working tree and a fresh extraction of the final ZIP:

```bash
npm ci
npm run check
npm test
npm run benchmark
npm run test:browser
npm run verify:api
npm run schemas:check
npm run api:check
npm run supply-chain:check
npm run verify:crash
npm run verify:clean-install
npm run verify:leaks
npm run verify:package
npm run release:metadata
npm run verify:supply-chain
npm run test:load
npm run test:soak
```

## Static and behavioral gates

`npm run check` runs TypeScript 6 checking, architecture and source-quality rules, and formatting verification.

`npm test` builds the project and runs the complete non-browser fixture suite, including lifecycle, persistence, HTTP, robots, sitemap, modern discovery, evidence, replay, comparison, operations, worker, fault, fuzz, and security behavior.

The real browser fixture is isolated in `npm run test:browser` so ordinary development does not require an installed browser binary.

## API and schema gates

`npm run verify:api` imports every stable package subpath and verifies the reviewed API surface. `npm run api:check` compares generated declarations with `api/declarations.sha256.json`.

`npm run schemas:check` verifies the generated JSON Schema set against runtime contracts. Persistent schemas describe the single current unpublished format.

## Package-consumer verification

`verify:package`:

1. builds and stages the package without executing source lifecycle scripts;
2. creates the release tarball;
3. stages sanitized copies of every installed runtime dependency;
4. installs the complete graph fully offline with lifecycle scripts disabled;
5. imports the root and every documented stable or experimental subpath;
6. type-checks a strict external TypeScript consumer;
7. executes the installed CLI against a local HTTP fixture;
8. verifies manifest schema, crawler version, and SQLite runtime metadata.

The verified package surfaces include:

```text
site-crawler
site-crawler/config
site-crawler/events
site-crawler/adapters
site-crawler/schemas
site-crawler/experimental
site-crawler/playwright
site-crawler/storage
site-crawler/query
site-crawler/opentelemetry
site-crawler/contracts
site-crawler/evidence
site-crawler/replay
site-crawler/diff
site-crawler/runs
site-crawler/operations
site-crawler/workers
site-crawler/security
```

## Crash, load, fuzz, and soak gates

`verify:crash` injects faults around journal append, lease, fetch, terminal transition, metadata writes, and close. Recovery must preserve valid state and idempotent terminal evidence.

`verify:leaks` runs warmup and measured file-spooling crawls under forced garbage collection, requires every temporary body to be removed, bounds retained heap growth, and rejects growth in file, socket, timer, pipe, or child-process resources. `test:load` runs the million-request frontier workload. `test:soak` repeatedly crawls a bounded local fixture for the configured duration and records memory/resource behavior. Deterministic fuzz behavior is covered by `test:fuzz` and the ordinary suite.

## Browser verification

`test:browser` starts a real Playwright Chromium session, executes JavaScript, captures final DOM HTML, checks final URL and errors, and shuts down the browser pool. CI installs an unmanaged Chromium build.

The verifier bounds each child test process, terminates the complete browser process group on timeout, and retries only after cleanup. This makes browser verification resilient to operating-system browser failures without hiding a failed attempt.

## Supply-chain gates

`verify:clean-install` copies only the package manifests into a temporary project, uses a new empty npm cache and the public npm registry, and checks the exact installed parser identities. `release:metadata` writes generated schemas, CycloneDX SBOM, release manifest, and provenance. `verify:supply-chain` verifies version alignment, public registry identities and SHA-512 lockfile integrity, and every source-file hash in the release manifest. The static `supply-chain/` inventory is checked separately with `supply-chain:check`.

## Runtime matrix

The CI matrix runs Node.js 24 and 26 across Linux, macOS, and Windows. Ubuntu additionally runs package-consumer, benchmark, browser, contract, crash, fuzz, load-smoke, soak-smoke, and supply-chain jobs.

## Source ZIP

The source ZIP includes source, tests, benchmarks, tools, documentation, lockfiles, schemas, API snapshots, supply-chain metadata, and CI configuration. It excludes Git history, installed dependencies, generated `dist`, coverage, crawl data, SQLite runtime files, temporary body spools, package tarballs, previous ZIPs, and checksums.

The final ZIP is extracted into a clean directory. Clean installation and all release gates are rerun from that extraction. ZIP structural integrity and SHA-256 are published beside the archive.
