# Run lifecycle

## Phases

A run moves through these phases:

```text
created
  -> initializing
  -> running
  -> stopping      when cancellation, a hard limit, or a fatal error occurs
  -> draining
  -> finalizing
  -> closed
```

The run controller owns the phase, the first terminal reason, the active-request count, and one cancellation signal shared by workers, HTTP, retry delays, politeness waits, XML decompression, and renderer calls. Explicit cancellation and fatal failure abort that signal. A hard crawl limit closes admission but does not abort a response already accepted inside the limit; that boundary response finishes processing before drain and finalization.

## Initialization

Initialization is part of the protected lifecycle. The crawler:

1. starts the runtime clock;
2. writes the initial manifest and resolved configuration;
3. opens the frontier journal and acquires the run lock;
4. reconstructs persisted requests and leases when resuming;
5. emits `run-started`;
6. invokes the run-start hook;
7. schedules seeds and bootstrap sitemaps for a fresh run;
8. starts workers.

A failure at any step becomes a fatal run error and still enters finalization when storage was initialized.

## Worker supervision

Workers are supervised as a group. The first rejected worker cancels the run, workers stop leasing new work, and the pool waits for every worker to settle before finalization starts.

Every leased request must be handled, failed, skipped, cancelled, or released. A lease heartbeat renews long-running work. Stale completion attempts are rejected.

## Finalization order

Finalization executes in this order:

1. enter draining;
2. wait for pending asynchronous event hooks;
3. invoke `onRunFinish`;
4. wait for hooks again;
5. enter finalizing;
6. close the frontier, HTTP client, and renderer;
7. compute and persist the effective result;
8. prepare the terminal `run-finished` hook after the manifest exists;
9. persist again if the terminal hook changed the result;
10. close the result store;
11. emit `run-finished` once;
12. close event subscriptions and mark the run closed.

A close failure changes the run to `failed`. Shutdown errors are not discarded.

## Cancellation

`crawler.abort(reason)` records the reason and aborts the shared signal. Active operations receive the signal, and active request leases are terminalized as `cancelled` when the interruption is attributable to run cancellation.

The CLI converts `SIGINT` and `SIGTERM` into this cancellation path.

## Terminal status

```text
completed         frontier exhausted, no request failures
partial           frontier exhausted, one or more request failures
stopped_by_limit  an explicit crawl limit stopped scheduling or execution
aborted           operator or caller cancellation
failed            fatal runtime, extension, persistence, or shutdown error
```
