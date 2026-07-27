# site-crawler

`@ismail-elkorchi/site-crawler` is a strict TypeScript crawler for collecting factual website data. It applies URL scope, robots, network-safety, and resource limits; parses HTML and XML; discovers linked resources; and stores typed crawl records that can be queried, replayed, or compared.

It is a crawler library and CLI, not an SEO scoring system.

## Requirements

- Node.js 24 or newer
- npm 11 or newer
- ESM

The SQLite backends use Node's built-in SQLite API. Node may print an experimental warning for that API.

## Install

```bash
npm install @ismail-elkorchi/site-crawler
```

The package uses `playwright-core` but does not download a browser. Chromium is needed only when you configure the optional Playwright renderer.

## Crawl from the CLI

```bash
site-crawler crawl https://example.com \
  --max-scheduled-requests 1000 \
  --max-fetched-resources 1000 \
  --max-depth 6 \
  --scope origin \
  --respect-robots \
  --discover-sitemaps \
  --out ./runs
```

`SIGINT` and `SIGTERM` request graceful cancellation. Run `site-crawler --help` for the operational commands used to resume, inspect, validate, export, replay, compare, and bundle completed runs.

## Crawl from TypeScript

```ts
import { SiteCrawler } from "@ismail-elkorchi/site-crawler";

const crawler = new SiteCrawler({
  seeds: ["https://example.com/"],
  limits: {
    maxScheduledRequests: 1000,
    maxFetchedResources: 1000,
    maxDepth: 6,
  },
  storage: {
    type: "sqlite",
    directory: "./runs",
  },
});

const result = await crawler.run();
console.log(result.status, result.outputDirectory);
```

The default SQLite storage and frontier are durable and queryable. Use `memory` for bounded tests or `filesystem` for portable NDJSON output with an append-only journal.

## Observe a crawl

Every call to `events()` creates an independent bounded subscription. Start consuming before awaiting `run()`:

```ts
const events = crawler.events();
const running = crawler.run();

for await (const event of events) {
  if (event.type === "progress") {
    console.log(event.stats.requestsFetched);
  }
}

const result = await running;
```

`run-finished` is the final event. The final manifest has already been persisted when it is emitted.

## Browser-rendered pages

```ts
import { SiteCrawler } from "@ismail-elkorchi/site-crawler";
import { PlaywrightRenderAdapter } from "@ismail-elkorchi/site-crawler/playwright";

const renderer = new PlaywrightRenderAdapter({
  browser: "chromium",
  executablePath: "/usr/bin/chromium",
  maxConcurrency: 2,
});

const crawler = new SiteCrawler(
  {
    seeds: ["https://example.com/app"],
    rendering: { mode: "auto", maxRenderedPages: 100 },
  },
  { renderer },
);
```

Rendered HTML enters the same extraction and discovery pipeline as HTTP HTML, while records preserve which representation was used.

## Resume a durable run

```ts
const crawler = new SiteCrawler({
  seeds: ["https://example.com/"],
  storage: {
    type: "sqlite",
    resumeFrom: "./runs/run_previous",
    resumePolicy: "operational",
  },
});
```

`exact` requires the same resolved configuration. `operational` permits settings such as concurrency and output buffering to change while requiring crawl semantics to remain the same. Network requests are at-least-once across a hard process crash; durable request and result identities make recovery idempotent locally.

## Package surfaces

- Root: crawler, configuration, events, extension types, and adapter contracts
- `schemas`: persistent schema catalog and runtime validation
- `playwright`: browser renderer
- `storage` and `query`: result persistence and read-only SQLite queries
- `opentelemetry`: structural telemetry adapter
- `evidence`, `replay`, and `diff`: offline evidence workflows
- `runs` and `operations`: run readers and operational functions
- `workers`: SQLite worker coordination and protocol
- `security`: run security checks

Lower-level parsing, transport, scheduling, and extraction modules are implementation details.

## Documentation

- [Configuration](./docs/configuration.md)
- [Crawling behavior](./docs/crawling.md)
- [Storage and operations](./docs/storage-and-operations.md)
- [Public API](./docs/public-api.md)
- [Development](./docs/development.md)

## License

MIT
