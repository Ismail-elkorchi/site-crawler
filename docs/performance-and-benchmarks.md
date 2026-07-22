# Performance and benchmarks

## Purpose

The benchmark suite is a deterministic local regression gate. It is not a universal throughput claim. Results depend on Node version, operating system, CPU, storage, and security policy.

Run it with:

```bash
npm run benchmark
```

The command builds the package and executes four bounded regression workloads:

- insertion of 10,000 requests into the SQLite frontier and 1,000 lease/terminal transitions;
- extraction of a 50,000-entry sitemap document;
- a four-origin crawl with 100 linked pages per origin;
- 100 requests multiplexed through one local HTTP/2 server.

Each workload validates its factual counts and a generous regression ceiling. The suite reports elapsed time, relevant throughput, memory delta where measured, remaining frontier work, and HTTP/2 session count.

## Interpretation

The benchmark protects against large accidental regressions in frontier SQL, parser budgets, origin scheduling, storage, and transport pooling. It should not be used to compare unrelated crawler products without a controlled shared methodology.

`SQLite` may emit an experimental or release-candidate warning on supported Node versions. The backend remains behind crawler-owned interfaces so this implementation detail does not define the public crawler contracts.

## Memory behavior

Response bodies use a memory threshold and spill to temporary files after that threshold. XML responses are stream-fed or file-fed into `xml-parser`; however, v0.9 still materializes the parser document tree before sitemap and feed entries are dispatched. The 50,000-entry sitemap benchmark therefore measures this current boundary and does not claim SAX-style entry emission.

## CI

The benchmark job runs on Node.js 24 in Ubuntu CI. The ordinary build/test/package matrix runs under Node.js 24 and 26 across Linux, macOS, and Windows. Browser performance is not part of the numeric benchmark because browser startup and host policy vary substantially; browser correctness has a separate real-navigation gate.

## Pre-1.0 reliability workloads

Two additional commands exercise v0.9 scale and longevity:

```bash
npm run test:load
npm run test:soak
```

`test:load` defaults to a one-million-request SQLite frontier workload. `SITE_CRAWLER_FRONTIER_REQUESTS` may lower the count for CI smoke gates.

`test:soak` repeatedly crawls a bounded local fixture and checks for failed runs and unbounded process growth. It defaults to sixty seconds; `SITE_CRAWLER_SOAK_MS` controls the duration.

The ordinary test suite also contains deterministic fuzz fixtures and crash-injection tests. These workloads are release evidence, not universal throughput claims.
