# Configuration

`SiteCrawler` accepts serializable plain data as its first constructor argument. Functions, adapters, middleware, and hooks belong in the optional second argument. Unknown fields and invalid values are rejected before a crawl starts.

```ts
import { SiteCrawler } from "@ismail-elkorchi/site-crawler";

const crawler = new SiteCrawler({
  seeds: ["https://example.com/"],
  scope: { mode: "origin" },
  limits: {
    maxScheduledRequests: 10_000,
    maxFetchedResources: 10_000,
    maxDepth: 8,
    maxRunTimeMs: 30 * 60_000,
    maxDownloadedBytes: 2_000_000_000,
  },
  network: {
    maxConcurrency: 12,
    maxConcurrencyPerOrigin: 2,
    requestTimeoutMs: 30_000,
  },
  responseLimits: {
    maxWireBytes: 5 * 1024 * 1024,
    maxDecodedBytes: 10 * 1024 * 1024,
    memoryThresholdBytes: 1024 * 1024,
  },
  storage: { type: "sqlite", directory: "./runs" },
});
```

## Seeds and scope

Each seed may be a URL string or a structured seed with its own label, user data, and scope. The default scope is origin-only. Other modes are `host`, `domain`, and `custom`; custom scope uses the include, exclude, allowed-host, and denied-host fields.

Scope also bounds URL length, path segments, query parameters, URLs per directory, and URLs per path pattern. A URL rejected by scope is recorded as skipped rather than silently discarded.

## Limits

`limits` controls request admission and resource processing:

- `maxScheduledRequests` caps accepted requests.
- `maxFetchedResources` caps completed fetches.
- `maxDepth` caps link depth.
- `maxRunTimeMs` caps run time.
- `maxQueueSize` caps pending work.
- `maxDiscoveredLinksPerPage` caps valid page candidates.
- `maxDownloadedBytes` caps aggregate downloaded bytes.

Reaching a hard limit stops new admission but allows the boundary response already in progress to be recorded.

HTML and XML parser budgets are configured under `parsing.html` and `parsing.xml`. Response byte limits are independent from parser limits.

## Network safety and HTTP

Private, loopback, link-local, and otherwise unsafe destinations are rejected by default. Enable localhost or private networks only for trusted targets or tests:

```ts
networkSafety: {
  allowLocalhost: true,
  allowPrivateNetworks: true,
}
```

The built-in client supports HTTP/1.1 and HTTP/2. `network.protocolPreference` accepts `auto`, `http1`, or `http2`. DNS results are checked before a connection, and redirects are checked again as new targets.

Large decoded bodies are spooled to private temporary files after `responseLimits.memoryThresholdBytes` and are removed after processing.

## Robots, sitemaps, feeds, JavaScript, and CSS

Robots and sitemap discovery are enabled by default. Sitemap parsing supports sitemap indexes, URL sets, and gzip-compressed XML under explicit file, entry, recursion, and parser budgets.

Static JavaScript and CSS discovery are opt-in. JavaScript discovery can use regex, AST, or hybrid analysis; it never executes scripts. CSS discovery recognizes tokenized `@import`, `url(...)`, and source-map references.

```ts
jsDiscovery: {
  enabled: true,
  mode: "ast",
  fetchScriptAssets: true,
  enqueueDiscoveredUrls: true,
},
cssDiscovery: {
  enabled: true,
  fetchStylesheets: true,
  enqueueDiscoveredUrls: false,
}
```

## Sessions and cache

Sessions can carry cookies and per-origin Basic or Bearer credentials. Persisted cookies are stored inside the individual run directory. Persisted configuration redacts credentials, and authenticated runs are marked sensitive.

The HTTP cache stores validators and can reuse a prior body after `304 Not Modified`. Cache paths and concurrency are operational settings; discovery and parsing choices are semantic settings.

For the complete TypeScript contract, use the exported `CrawlConfig` type and the declarations shipped with the package.
