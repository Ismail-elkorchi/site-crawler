# Request state machine

## Identity

A normalized URL plus HTTP method forms the request unique key. Repeated discoveries do not create another request, but each discovery can be stored as independent evidence.

## States

```text
pending
  -> in_progress
  -> handled
  -> failed
  -> skipped
  -> cancelled

in_progress
  -> retrying
  -> released
  -> handled
  -> failed
  -> skipped
  -> cancelled

released
  -> pending
```

`handled`, `failed`, `skipped`, and `cancelled` are terminal.

## Lease ownership

Leasing produces a `leaseId`, `leasedAt`, and `expiresAt`. Every renewal and terminal transition must present the current lease identifier. A stale worker cannot commit a transition after ownership changed.

Long requests renew leases on a configured interval. On resume:

- terminal requests remain terminal;
- pending requests return to the queue;
- expired leases are recovered as pending;
- unexpired leases remain deferred until expiry;
- invalid transition history rejects resume.

## Outcome meanings

`handled` means the request lifecycle completed and the fetched resource evidence was processed. It does not mean the HTTP status was 2xx.

`failed` means transport, extension, parsing orchestration, or request execution failed.

`skipped` means a policy intentionally prevented execution, such as scope, robots, or network safety.

`cancelled` means run cancellation interrupted the request.

`released` means execution did not begin or ownership was intentionally returned to the frontier.

## Delivery guarantee

Across a hard crash, remote network activity is at-least-once. The crawler does not claim exactly-once fetching. It provides durable request identity, one active lease per request in a single run directory, validated terminal transitions, and idempotent resume reconstruction.
