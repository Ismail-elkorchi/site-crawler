# Durability and resume

## Storage modes

v0.9 supports three result-storage modes and three frontier backends.

| Result storage | Default frontier | Durability                               |
| -------------- | ---------------- | ---------------------------------------- |
| `memory`       | `memory`         | Process lifetime only                    |
| `filesystem`   | `journal`        | Append-only journal and NDJSON evidence  |
| `sqlite`       | `sqlite`         | Indexed request state and crawl evidence |

An explicit matching `frontierBackend` can override the inferred backend.

## Filesystem journal

Journal runs use `frontier.ndjson` as an append-only request-state log. Each record contains a monotonic sequence, preceding checksum, own checksum, typed state transition, and timestamp.

Writes are serialized. Resume rejects non-monotonic sequences, checksum breaks, unknown records, invalid transitions, stale lease transitions, and duplicate terminal transitions.

An incomplete final line may be ignored because process termination can interrupt the last append. Corruption inside a complete earlier record is fatal.

## SQLite frontier

SQLite runs store request identity, discovery state, priority, depth, origin, queue order, lease ownership, lease expiry, and terminal state in indexed tables.

Leasing is atomic. An active lease belongs to one worker. Long requests renew leases. Expired leases can be recovered; unexpired leases remain deferred during resume.

The SQLite backend does not require reconstructing the complete frontier in memory.

## Run ownership

A durable run owns its directory through `run.lock.json`. The lock records process and host identity and is renewed by heartbeat. Another process cannot open an active run directory. A stale lock can be recovered only after the configured stale interval.

Single-owner operations remain protected by `run.lock.json`. Crawling work may additionally be coordinated across local Node.js processes through the SQLite worker coordinator. Worker heartbeat and origin ownership do not replace the run-directory lock for compaction or metadata replacement.

## Resume policies

`exact` compares the complete resolved configuration fingerprint.

`operational` compares crawl-semantic configuration while allowing operational changes, including selected concurrency, buffer, synchronization, output, spool, cache-directory, and telemetry settings.

Resume preserves:

- run ID and original start time;
- persisted counters;
- handled, failed, skipped, and cancelled states;
- pending work;
- deferred unexpired leases;
- recovered expired leases;
- request and discovery identity.

Resume and replay accept only the current run format and reject unknown schema versions.

## Result persistence

SQLite result storage indexes typed crawl records. Optional NDJSON exports remain available.

Filesystem record streams use buffered sinks. Manifest, statistics, summary, and resolved configuration use temporary-file replacement. Optional synchronization calls `fsync` before replacement or sink flush.

Raw HTML and XML snapshots are opt-in and are marked in the manifest. Persistent cookies are stored only under the run directory.

## Response and cache files

Large response bodies may be temporarily spooled to disk. Temporary bodies are deleted after the relevant resource processor completes.

HTTP cache bodies are non-temporary evidence owned by the configured cache directory. A cached `304` reuse identifies its cache status and does not masquerade as a newly downloaded body.

## Failure semantics

A frontier, HTTP client, renderer, or result-store close failure changes the final run status to `failed`. The crawler attempts to persist the updated fatal result before emitting the terminal event.

Disk-full, permission, corrupt state, unsupported schema, and active-run lock errors are fatal persistence conditions.

Network activity is at-least-once across hard crashes. Durable request identity and terminal states prevent intentional rescheduling of completed work, but a request interrupted after remote processing and before local commit may be fetched again.

## Content-addressed evidence

When evidence capture is enabled, source HTML and XML bytes are stored by SHA-256 digest. Associations between requests and evidence objects are idempotent. Identical bytes are stored once. Evidence bundle verification checks containment, size, decompression limits, and hashes before accepting the bundle.

## Crash and worker guarantees

Network execution is at-least-once after a hard crash. Durable identity, lease ownership, discovery evidence, terminal state, indexed result writes, and evidence associations are idempotent. Stale worker or lease completion is rejected. Exactly-once network execution is not claimed.
