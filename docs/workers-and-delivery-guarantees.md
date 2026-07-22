# Workers and delivery guarantees

## Local multi-process coordination

v0.9 supports multiple local Node.js worker processes through SQLite coordination. Workers share durable request and result state while retaining independent process lifecycles.

The coordinator records worker identity, process, host, start and heartbeat times, status, atomic request leases, lease ownership and expiry, origin ownership, counters, and stale-worker recovery.

Multi-process mode requires the SQLite frontier and result store. Filesystem journal and memory backends remain single-process.

## Delivery guarantees

- Network execution is **at least once** across hard crashes.
- One request identity has at most one valid active lease at a time.
- Stale lease completion is rejected.
- Discovery evidence is idempotent.
- Terminal request state is idempotent.
- Indexed result writes use stable identities and idempotent upserts.
- Evidence object storage is content-addressed and immutable.

The crawler does not claim exactly-once network execution. A process can fetch a resource and crash before local commit, causing a later recovery fetch.

## Worker shutdown

Graceful shutdown stops new leasing, aborts active operations, terminalizes or releases leases according to execution state, flushes results, records worker shutdown, and closes shared resources.

A stale worker is recoverable only after its heartbeat and lease thresholds expire. Recovery is explicit and recorded.
