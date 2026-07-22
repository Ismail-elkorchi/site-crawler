# site-crawler

`site-crawler` is a strict TypeScript crawler for collecting factual evidence from real websites. It discovers and schedules URLs, applies scope and robots policy, fetches HTTP resources, parses HTML with `@ismail-elkorchi/html-parser`, parses XML with `@ismail-elkorchi/xml-parser`, and persists typed records for requests, resources, links, sitemaps, feeds, browser-rendered pages, failures, and run state.

The crawler does not score SEO quality and does not recommend changes. It provides the crawl substrate on which an auditing application can be built.

## Version 0.1.0

v0.1.0 is the current unpublished contract and reliability release. It provides:

- curated stable, experimental, and internal public API surfaces with declaration snapshots;
- versioned runtime contracts and generated JSON Schemas for persistent records;
- content-addressed, optionally compressed HTML and XML evidence;
- offline extraction replay and deterministic factual run comparison;
- idempotent indexed result persistence and stable record identities;
- SQLite worker coordination for multiple local worker processes;
- explicit at-least-once network-delivery semantics and lease ownership;
- operational commands for resume, abort, inspection, validation, compaction, export, replay, comparison, evidence bundling, and diagnostics;
- deterministic crash injection, fuzz, million-frontier load, and soak harnesses;
- security auditing, path-containment checks, bounded evidence decoding, SBOMs, provenance, release manifests, and package-consumer verification;
- Node.js 24 and 26 CI across Linux, macOS, and Windows.

v0.1.0 removes unpublished compatibility layers and defines one current persistent format.

## Requirements

- Node.js 24 or newer
- npm 11 or newer
- ESM

Node's built-in SQLite API is used by the SQLite backends. Node may still print an experimental warning for that API on some supported versions; SQLite-specific types do not leak into crawler-core contracts.

## Install

```bash
npm install site-crawler
```

The base package depends on `playwright-core`, but it does not download a browser binary. A browser executable is needed only when the Playwright adapter is used.

## Quick start

```ts
import { SiteCrawler } from "site-crawler";

const crawler = new SiteCrawler({
  seeds: ["https://example.com/"],
  limits: {
    maxScheduledRequests: 50_000,
    maxFetchedResources: 50_000,
    maxDepth: 12,
  },
  storage: {
    type: "sqlite",
    directory: "./runs",
  },
});

const result = await crawler.run();
console.log(result.status, result.outputDirectory);
```

`sqlite` is the default storage type. For tests or small in-process crawls, use `memory`. For portable NDJSON-first runs, use `filesystem`.

## Storage and frontier backends

Result storage and request scheduling are separate decisions. When `frontierBackend` is not specified, it follows the storage type:

| Storage type | Default frontier | Purpose                                       |
| ------------ | ---------------- | --------------------------------------------- |
| `memory`     | `memory`         | Tests and bounded temporary crawls            |
| `filesystem` | `journal`        | Portable append-only evidence and resume      |
| `sqlite`     | `sqlite`         | Indexed durable crawling and larger frontiers |

```ts
const crawler = new SiteCrawler({
  seeds: ["https://example.com/"],
  storage: {
    type: "sqlite",
    frontierBackend: "sqlite",
    frontierOrder: "priority",
    directory: "./runs",
    writeNdjsonExports: true,
  },
});
```

The SQLite frontier persists request identity, state, priority, depth, origin, lease ownership, lease expiry, and insertion order. The SQLite result store indexes crawl records while optional NDJSON exports remain available for portability.

## Resume

```ts
const resumed = new SiteCrawler({
  seeds: ["https://example.com/"],
  storage: {
    type: "sqlite",
    resumeFrom: "./runs/run_previous",
    resumePolicy: "operational",
  },
});
```

`exact` requires the exact resolved-configuration fingerprint. `operational` permits operational changes such as concurrency, buffering, spool paths, cache directories, and telemetry while preserving crawl-semantic settings.

Network requests are at-least-once across a hard process crash. Request identities, discoveries, leases, terminal states, indexed results, and evidence associations are durable and idempotent. SQLite coordination supports independent local worker processes; the crawler does not claim exactly-once remote execution.

## Origin-aware crawling and throttling

The scheduler chooses ready work by origin before a worker receives a lease. This prevents workers from holding leases while waiting behind a busy origin.

```ts
const crawler = new SiteCrawler({
  seeds: ["https://example.com/", "https://docs.example.net/"],
  network: {
    maxConcurrency: 16,
    maxConcurrencyPerOrigin: 3,
    maxRequestsPerMinutePerOrigin: 120,
    autoThrottle: {
      enabled: true,
      targetConcurrencyPerOrigin: 2,
      startDelayMs: 100,
      minDelayMs: 0,
      maxDelayMs: 30_000,
      smoothing: 0.3,
    },
  },
});
```

Adaptive delay uses first-byte latency and failure signals. `429`, selected `5xx` responses, and transport failures can increase delay but do not reduce it.

## HTTP/1.1, HTTP/2, and response bodies

```ts
const crawler = new SiteCrawler({
  seeds: ["https://example.com/"],
  network: {
    protocolPreference: "auto", // auto | http1 | http2
    connectTimeoutMs: 10_000,
    firstByteTimeoutMs: 20_000,
    requestTimeoutMs: 30_000,
  },
  responseLimits: {
    maxCompressedBytes: 5 * 1024 * 1024,
    maxDecompressedBytes: 10 * 1024 * 1024,
    memoryThresholdBytes: 1024 * 1024,
    spoolDirectory: "./tmp/bodies",
  },
});
```

Small bodies remain in memory. Larger bodies are spooled to bounded temporary files and removed after processing. Resource facts distinguish wire bytes, HTTP-decoded bytes, file-level XML decompression bytes, DNS/connect/TLS/first-byte/body timings, remote address, TLS facts, and negotiated protocol.

The built-in transport resolves a target through the network-safety policy and connects directly to an approved address while preserving the original HTTP host and TLS SNI. Redirect targets are checked independently.

## Sessions and authentication

```ts
const crawler = new SiteCrawler({
  seeds: ["https://example.com/account"],
  session: {
    enabled: true,
    persistCookies: true,
    initialCookies: [
      { url: "https://example.com/", cookie: "locale=en; Path=/" },
    ],
    basicAuth: [
      {
        origin: "https://example.com",
        username: "crawler",
        password: process.env.CRAWL_PASSWORD ?? "",
      },
    ],
  },
  storage: { type: "sqlite", directory: "./runs" },
});
```

Persisted cookies are resolved inside the individual run directory and cannot be shared accidentally by unrelated runs. Credentials and cookies are redacted from persisted configuration and ordinary logs. Runs using sessions or authentication are marked sensitive in the manifest.

## Conditional recrawling

```ts
const crawler = new SiteCrawler({
  seeds: ["https://example.com/"],
  httpCache: {
    enabled: true,
    directory: "./cache",
    storeBodies: true,
    maxBodyBytes: 10 * 1024 * 1024,
    useStaleOnError: false,
  },
});
```

The cache records ETag and Last-Modified validators. A `304` response can reuse the previously stored body while preserving a factual `revalidated` cache status. Cache directories are operational settings and are excluded from operational-resume fingerprints.

## JavaScript and CSS discovery

```ts
const crawler = new SiteCrawler({
  seeds: ["https://example.com/"],
  jsDiscovery: {
    enabled: true,
    mode: "hybrid", // regex | ast | hybrid
    fetchScriptAssets: true,
    enqueueDiscoveredUrls: true,
  },
  cssDiscovery: {
    enabled: true,
    fetchStylesheets: true,
    enqueueDiscoveredUrls: false,
  },
});
```

The JavaScript AST path recognizes bounded static string evidence such as `fetch()`, dynamic imports, source maps, and URL-like literals. CSS discovery recognizes `@import`, `url(...)`, and source maps. Every candidate records extraction method, confidence, and source offset when available. Static discovery never executes JavaScript.

## Browser rendering

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
  screenshotDirectory: "./runs/screenshots",
});

const crawler = new SiteCrawler(
  {
    seeds: ["https://example.com/app"],
    rendering: {
      mode: "auto",
      maxRenderedPages: 100,
      waitUntil: "domcontentloaded",
    },
  },
  { renderer },
);
```

Rendered HTML enters the same extraction and discovery pipeline as raw HTTP HTML. Records preserve `htmlSource` so the two representations remain distinguishable. Auto-rendering can use low text, missing navigation, framework-shell markers, and configured URL patterns.

`operationTimeoutMs` bounds the complete render transaction, while `closeTimeoutMs` bounds browser-context and browser shutdown. A render that loses its browser connection therefore rejects predictably instead of leaving an unresolved promise with no active event-loop resource.

## XML, sitemaps, and feeds

Sitemap URL sets, sitemap indexes, `.xml.gz` payloads, RSS-like feeds, and Atom-like feeds are parsed with `xml-parser` under explicit budgets. XML input is stream-fed into the parser, but v0.9 materializes the parser document tree before dispatching sitemap and feed entries. It does **not** claim SAX-style incremental entry emission.

Run-wide sitemap file, entry, recursion, and index-depth limits are enforced. Invalid optional fields and missing locations are preserved as diagnostics rather than silently discarded.

## Middleware and hooks

Configuration is serializable plain data. Runtime behavior is supplied through the second constructor argument.

```ts
const crawler = new SiteCrawler(
  { seeds: ["https://example.com/"] },
  {
    middlewares: {
      beforeRequest: [
        (_context, request) =>
          request.normalizedUrl.includes("/logout")
            ? {
                kind: "skip",
                reason: "USER_EXCLUDE_PATTERN",
                detail: "Do not follow logout links",
              }
            : { kind: "continue" },
      ],
      afterResource: [],
    },
    hooks: {
      onHtmlParsed(_context, page) {
        console.log(page.finalUrl);
      },
    },
    failureMode: "record",
  },
);
```

Supported extension failure modes are `record`, `fail-request`, and `fail-run`.

## Events and OpenTelemetry

Each call to `events()` creates an independent bounded subscription.

```ts
const events = crawler.events();
const running = crawler.run();

for await (const event of events) {
  if (event.type === "progress") console.log(event.stats.requestsFetched);
}

const result = await running;
```

`run-finished` is emitted once and is the final event. The terminal manifest has already been persisted when terminal hooks execute.

The optional OpenTelemetry adapter uses structural interfaces and does not require an OpenTelemetry SDK dependency:

```ts
import { createOpenTelemetryHooks } from "site-crawler/opentelemetry";

const hooks = createOpenTelemetryHooks({ meter, tracer });
const crawler = new SiteCrawler(config, { hooks });
```

## Indexed queries

```ts
import { CrawlIndex } from "site-crawler/query";

if (result.outputDirectory === null)
  throw new Error("SQLite output is unavailable.");
const index = new CrawlIndex(result.outputDirectory);
try {
  const missing = index.query({ kind: "resource", statusCode: 404 });
  const incoming = index.incomingLinks("https://example.com/page");
  const sitemapOnly = index.sitemapOnlyUrls();
  const duplicates = index.duplicateBodyHashes();
} finally {
  index.close();
}
```

The query API opens completed SQLite evidence read-only.

## Package exports

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
```

The root export remains deliberately small. Lower-level helpers remain under `experimental` until their contracts are stable.

## Stable contracts and schemas

Stable runtime surfaces are exported from the package root and documented subpaths. Experimental helpers remain under `site-crawler/experimental` and may change before publication.

```ts
import { runtimeContracts, validateContract } from "site-crawler/contracts";
import {
  persistentSchemas,
  validatePersistentValue,
} from "site-crawler/schemas";

const manifest = validateContract("run-manifest", unknownManifest);
const validation = validatePersistentValue(unknownManifest);
```

The repository stores generated JSON Schemas and a declaration-hash snapshot. CI rejects stale schemas or unreviewed public declaration changes.

## Content-addressed evidence, replay, and comparison

```ts
import {
  ContentAddressedEvidenceStore,
  createEvidenceBundle,
  verifyEvidenceBundle,
} from "site-crawler/evidence";
import { replayRun } from "site-crawler/replay";
import { compareRuns } from "site-crawler/diff";
```

Raw HTML and XML evidence can be stored once by SHA-256 and associated with multiple requests. Evidence bundles validate hashes, enforce path containment, and optionally gzip objects under bounded decoding limits.

Replay reruns HTML or XML extraction without network access and records parser and crawler provenance. Comparison emits factual changes such as appeared or disappeared pages, HTTP status, redirect, title, metadata, heading, link, sitemap, robots, and body-hash changes. It does not assign SEO importance.

## Local worker coordination and delivery guarantees

The SQLite worker coordinator provides atomic leases, heartbeat, stale-worker recovery, origin ownership, and idempotent terminal transitions across independent local Node.js processes.

Network fetches are at-least-once across hard crashes. Request identity, discovery evidence, terminal state, result identity, and evidence association are idempotent. The crawler does not claim exactly-once network execution.

## Operational CLI

```text
site-crawler crawl <url> [--config FILE] [--out DIR]
site-crawler resume <run-dir>
site-crawler abort <run-dir> [--reason TEXT]
site-crawler inspect <run-dir>
site-crawler validate-config <config.json>
site-crawler validate-run <run-dir>
site-crawler compact <run-dir>
site-crawler checkpoint <run-dir>
site-crawler export <run-dir> --out DIR
site-crawler replay <run-dir> [--out FILE]
site-crawler compare <base-run> <target-run> [--out FILE]
site-crawler evidence-bundle <run-dir> [--out DIR] [--gzip]
site-crawler doctor
```

## Filesystem output

A SQLite run typically contains:

```text
<run-directory>/
  manifest.json
  config.resolved.json
  stats.json
  summary.md
  crawl.sqlite
  run.lock.json
  session/
    cookies.json          # only when enabled
  snapshots/              # only when enabled
  exports/ or *.ndjson    # when NDJSON export is enabled
```

Raw snapshots are disabled by default. Authenticated and session-enabled runs are marked sensitive.

## CLI

```bash
site-crawler crawl https://example.com \
  --max-scheduled-requests 50000 \
  --max-fetched-resources 50000 \
  --max-depth 12 \
  --scope origin \
  --respect-robots \
  --discover-sitemaps \
  --out ./runs
```

`SIGINT` and `SIGTERM` request graceful cancellation.

## Verification and benchmarks

```bash
npm ci
npm run check
npm test
npm run benchmark
npm run test:browser
npm run verify:crash
npm run verify:package
npm run verify:api
npm run verify:release
npm run test:load
npm run test:soak
```

`benchmark` runs deterministic local frontier, sitemap, multi-origin, and HTTP/2 workloads. `test:load` exercises the million-request frontier, while `test:soak` repeatedly crawls a bounded local site for the configured duration. These are regression and reliability gates, not universal performance claims.

`test:browser` requires a Chromium, Firefox, or WebKit executable supported by the configured Playwright adapter. CI installs Chromium for the browser-navigation job.

`verify:package` packs the project, installs the tarball into an isolated consumer, checks all documented JavaScript and strict TypeScript subpath imports, and executes the installed CLI against a local fixture server.

## Documentation

- [Runtime architecture](./docs/architecture.md)
- [Run lifecycle](./docs/lifecycle.md)
- [Request state machine](./docs/request-state-machine.md)
- [Durability and resume](./docs/durability-and-resume.md)
- [Storage, frontier, and indexed queries](./docs/storage-frontier-and-query.md)
- [HTTP sessions and conditional cache](./docs/http-sessions-and-cache.md)
- [Browser rendering](./docs/browser-rendering.md)
- [Performance and benchmarks](./docs/performance-and-benchmarks.md)
- [Robots and sitemaps](./docs/robots-and-sitemaps.md)
- [Release verification](./docs/release-verification.md)
- [Stable API and persistent schemas](./docs/public-api-and-schemas.md)
- [Evidence, replay, and differential crawling](./docs/evidence-replay-and-diff.md)
- [Workers and delivery guarantees](./docs/workers-and-delivery-guarantees.md)
- [Security and supply chain](./docs/security-and-supply-chain.md)
- [CLI operations](./docs/cli-operations.md)

## License

MIT
