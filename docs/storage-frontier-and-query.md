# Storage, frontier, and indexed queries

## Separate responsibilities

Result storage and request scheduling are independent capabilities. A crawl can use a portable filesystem result store with a SQLite frontier, although the default combinations are intentionally simpler:

| Result storage | Default frontier | Intended use                                |
| -------------- | ---------------- | ------------------------------------------- |
| `memory`       | `memory`         | Tests and bounded temporary crawls          |
| `filesystem`   | `journal`        | Portable NDJSON evidence and local resume   |
| `sqlite`       | `sqlite`         | Indexed evidence and larger local frontiers |

The resolved run manifest records both choices and the frontier order.

## Frontier ordering

`frontierOrder` accepts `priority`, `bfs`, or `dfs`.

`priority` orders by request priority, then depth, then insertion order. `bfs` and `dfs` use insertion order. SQLite scheduling first attempts the globally best ready request and then selects one ready request per origin when the origin reservation policy rejects that candidate. This avoids assigning a lease to work that must wait behind another request from the same origin.

## Durable state

The journal backend stores checksummed transitions. The SQLite backend stores request identity, state, priority, depth, origin, seed, availability, lease identity, and lease expiry in indexed tables. Both backends preserve one request identity while allowing multiple discovery records.

A durable run owns single-owner maintenance operations through a heartbeat lock. v0.9 can additionally coordinate independent local worker processes through SQLite heartbeats, atomic leases, and origin ownership. Filesystem journal and memory backends remain single-process.

## SQLite result store

The SQLite result store writes typed records and metadata into `crawl.sqlite`. Optional NDJSON exports remain available for portability. The query API opens completed evidence read-only:

```ts
import { CrawlIndex } from "site-crawler/query";

const index = new CrawlIndex(runDirectory);
try {
  const missing = index.query({ kind: "resource", statusCode: 404 });
  const incoming = index.incomingLinks("https://example.com/page");
  const sitemapOnly = index.sitemapOnlyUrls();
  const htmlOnly = index.htmlOnlyUrls();
  const duplicates = index.duplicateBodyHashes();
} finally {
  index.close();
}
```

Queries are factual. The crawler does not assign SEO importance to any returned record.

## Resume policies

`exact` resume requires the full resolved configuration fingerprint. `operational` allows operational changes while retaining crawl-semantic settings. Storage location, write buffering, synchronization, spool paths, selected concurrency, cache directory, and telemetry can change operationally. Scope, limits, discovery behavior, sessions, cache semantics, parser budgets, rendering behavior, protocol preference, frontier backend, and frontier order remain semantic.

Only the current run format is accepted. Runs produced by unpublished earlier development versions are intentionally unsupported.
