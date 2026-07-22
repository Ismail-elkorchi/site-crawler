# Runtime architecture

## Composition root

`SiteCrawler` is the public facade. It resolves plain configuration, runtime extensions, identity, persistence, policy, scheduling, fetching, processing, worker supervision, and finalization.

```text
SiteCrawler
  -> CrawlerRuntime
     -> RuntimeIdentity
     -> RuntimeFoundation
        -> ResultStore
        -> Frontier
        -> RunController
        -> CrawlEventHub
        -> ScopePolicy
        -> NetworkSafetyPolicy
        -> RobotsService
        -> RequestScheduler
     -> RuntimeExecution
        -> RequestPolicyRunner
        -> PolitenessController
        -> RetryingFetcher
        -> ResourceProcessor
        -> RequestHandler
        -> WorkerPool
        -> RunFinalizer
```

Parsers do not fetch. HTTP transports do not parse HTML or XML. Storage does not decide crawl policy. Policies do not write result records directly.

## Configuration boundary

`CrawlConfig` accepts serializable plain data. `parseCrawlConfig` validates unknown input. `resolveConfig` applies defaults, normalizes seeds, resolves storage/frontier combinations, and deeply freezes the result.

Runtime behavior is supplied separately through `CrawlerExtensions`:

- custom HTTP client;
- renderer;
- hooks;
- request and resource middleware;
- extension failure mode;
- event-buffer capacity.

Exact and operational configuration fingerprints support resume without embedding functions or class instances in persisted state.

## Run lifecycle

`RunController` owns lifecycle phase, run-wide cancellation, stop detail, fatal error, active-request count, and run limits.

`WorkerPool` supervises all workers as a group. A fatal worker failure cancels the run, prevents new leases, and drains workers before finalization.

`RunFinalizer` persists the effective result, runs terminal hooks against persisted metadata, closes runtime capabilities, updates persistence if shutdown fails, and emits `run-finished` once as the final event.

## Frontier abstraction

`Frontier` delegates request state to one of three backends:

```text
memory      -> bounded tests and temporary crawls
journal     -> append-only checksummed filesystem state
sqlite      -> indexed durable scheduling and larger frontiers
```

All backends expose the same enqueue, lease, renewal, release, terminalization, recovery, counting, and close semantics.

SQLite scheduling indexes request identity, state, priority, depth, origin, insertion sequence, and lease expiry. It can select ready candidates without loading the complete frontier into memory.

The filesystem journal serializes checksum-chained records and validates sequence, ownership, request existence, and legal state transitions during replay.

## Request scheduling

`RequestEnqueueTransaction` normalizes and identifies a candidate before consuming scheduling or trap budgets. Repeated discoveries preserve evidence while reusing one request identity.

```text
raw discovery
  -> URL normalization
  -> unique-key lookup
  -> discovery evidence
  -> semantic limits and trap reservation
  -> frontier enqueue
  -> accounting and output records
```

The scheduler selects requests whose origins are eligible before assigning worker leases. Per-origin readiness considers active concurrency, delay, token-bucket rate limits, and adaptive throttle state.

## Politeness

`PolitenessController` maintains one slot per origin. It combines:

- maximum concurrent requests per origin;
- minimum delay;
- optional requests-per-minute token bucket;
- robots crawl delay;
- adaptive delay based on first-byte latency;
- slowdown after transport failures, `429`, and selected `5xx` responses.

Availability notification is event-driven rather than a fixed polling loop.

## HTTP transports

`NodeHttpTransport` selects HTTP/1.1 or HTTP/2 according to protocol preference and URL scheme.

Both transports use `NetworkSafetyPolicy` before connection. The chosen approved address is bound to the connection while the original hostname remains available for the Host header and TLS SNI.

HTTP/2 sessions are pooled by origin and approved address. HTTP/1.1 maintains reusable agents. Transport facts include DNS, connection, TLS, first-byte, body, total duration, remote address, TLS details, and negotiated protocol.

## Response body ownership

A response body is either:

```ts
type ResponseBody =
  | { kind: "memory"; bytes: Uint8Array; size: number }
  | { kind: "file"; path: string; size: number; temporary: boolean };
```

Compressed and decoded budgets are enforced while streaming. Small bodies stay in memory; large bodies spool to temporary files. Resource processors read or stream the body and dispose temporary files after processing.

## Sessions and cache

`SessionManager` owns cookies and per-origin Basic/Bearer authentication. Persisted cookies are resolved under the individual run directory.

`HttpCache` owns validators and optional cached bodies. It prepares conditional headers and can combine a `304` response with a stored body. Cache status remains explicit in resource facts.

HTTP sessions and cache are independent of HTML/XML parsing.

## Resource processing

`ResourceProcessor` classifies the response and delegates:

- HTML to `html-parser` and HTML extraction;
- XML to `xml-parser` and sitemap/feed extraction;
- JavaScript to bounded AST/regex discovery when enabled;
- CSS to bounded stylesheet discovery when enabled;
- other classes to factual resource recording.

HTTP `Link` headers and expanded HTML URL-bearing surfaces are processed as discovery evidence. Raw HTTP and browser-rendered HTML use the same extraction path but retain different provenance.

XML bodies are stream-fed into `xml-parser`. v0.9 dispatches entries from the resulting document tree; it does not expose SAX-style incremental entry callbacks.

## Browser rendering

Rendering remains an adapter capability. `PlaywrightRenderAdapter` provides a production adapter without changing crawler-core dependencies on browser state.

The adapter owns browser startup, pooling, isolated contexts, cookie transfer, request blocking, page observation, screenshots, and cancellation. Rendered HTML re-enters ordinary HTML extraction.

Render execution and shutdown are bounded independently. The adapter retains a referenced deadline while Playwright work is pending, so a disconnected browser cannot leave an unresolved render promise after the event loop becomes idle.

The adapter launches browsers through `BrowserServer`, connects as a client, and owns both connection and process lifecycles. Shutdown escalates from graceful server close to the public force-kill operation under a separate deadline.

## Storage and query

Result storage is capability-based. SQLite provides durable indexed evidence, while filesystem storage provides buffered NDJSON streams and memory storage supports tests.

Manifest, resolved configuration, statistics, and summary use atomic replacement. Optional `fsync` strengthens local durability.

`CrawlIndex` opens completed SQLite evidence read-only and provides common URL, resource, link, sitemap, and duplicate-hash queries.

## Events and telemetry

`CrawlEventHub` broadcasts independently to bounded subscriber queues. A slow subscriber may drop its own oldest events without blocking the crawler or other subscribers. Dropped-event counts remain observable.

The OpenTelemetry adapter translates lifecycle, request, resource, throttle, and progress events through structural meter/tracer contracts, so crawler core does not require an OpenTelemetry SDK.

## Public boundaries

The package root exposes the stable facade, configuration entry points, events, extension contracts, and principal results. Browser, storage, query, telemetry, contracts, evidence, replay, comparison, run, operation, worker, security, adapter, and schema contracts use explicit subpaths. Low-level helpers remain under `experimental` before 1.0. Declaration hashes and runtime contract schemas protect the reviewed public boundary.

## Evidence and current-format contracts

v0.9 adds four layers above the crawl engine without moving policy into storage or parsers:

```text
persistent runtime contracts and generated schemas
  -> content-addressed evidence and offline replay
  -> deterministic factual run comparison
```

The contract catalog validates unknown persistent data. Evidence objects are immutable SHA-256-addressed bytes. Replay uses stored evidence instead of network access. Comparison emits factual changes without assigning importance.

## Local worker processes

The SQLite worker coordinator extends durable scheduling to independent local Node.js processes. It owns worker heartbeat, stale-worker recovery, atomic request leasing, origin ownership, and idempotent terminal/result writes. The network-delivery guarantee remains at-least-once across hard crashes.
