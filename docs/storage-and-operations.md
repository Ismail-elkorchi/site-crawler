# Storage and operations

## Storage choices

Result storage and frontier persistence are configured together by default:

| Storage      | Default frontier | Use                                        |
| ------------ | ---------------- | ------------------------------------------ |
| `memory`     | `memory`         | Tests and bounded temporary crawls         |
| `filesystem` | `journal`        | Portable NDJSON records and durable resume |
| `sqlite`     | `sqlite`         | Indexed durable runs and larger frontiers  |

All filesystem run data is created with private permissions. SQLite storage can also write NDJSON exports with `writeNdjsonExports`.

A durable run contains a manifest, resolved redacted configuration, statistics, summary, frontier state, and result records. Optional raw HTML and XML are stored by SHA-256 under the run's evidence directory.

## Resume

`storage.resumeFrom` points to a previous run directory.

- `exact` requires the same complete configuration fingerprint.
- `operational` permits operational changes while preserving crawl semantics.

Resume reconstructs scheduling reservations from durable requests, recovers expired leases, and preserves the original run identity and start time. Only the current persisted schema version is supported.

## Querying SQLite output

```ts
import { CrawlIndex } from "@ismail-elkorchi/site-crawler/query";

const index = new CrawlIndex(result.outputDirectory);
try {
  const missing = index.query({ kind: "resource", statusCode: 404 });
  const incoming = index.incomingLinks("https://example.com/page");
  const duplicates = index.duplicateBodyHashes();
} finally {
  index.close();
}
```

`CrawlIndex` opens completed crawl data read-only.

## Evidence, replay, and comparison

`@ismail-elkorchi/site-crawler/evidence` creates and verifies portable evidence bundles. Objects are content-addressed, deduplicated, path-contained, and optionally gzip-compressed.

`replayRun()` reruns extraction from captured HTML and XML without network access. `compareRuns()` reports factual differences such as appeared resources, status changes, redirects, titles, metadata, links, sitemap entries, robots rules, and body hashes. It does not score their importance.

## CLI operations

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

Use `validate-run` before replay, comparison, or archival when a run directory may have been moved or modified.

## Multiple local workers

The `workers` subpath exposes the typed worker protocol, session, and SQLite coordinator. The coordinator provides worker registration, heartbeats, origin ownership, stale-worker recovery, and atomic permit handling. It coordinates local processes sharing one SQLite run; it is not a distributed queue service.
