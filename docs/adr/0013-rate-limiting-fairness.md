# ADR-0013: Distributed rate limiting + fair multi-tenant scheduling

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S11
- **Deciders:** Relay authors

## Context
Relay must be a good API citizen (respect each vendor's rate limits) AND a fair host (no tenant
monopolizes the workers). Three sharp facts: (1) a vendor's rate limit is **per account**, so every org
sharing one connection shares one budget; (2) FIFO scheduling is unfair under skew — one org's 10,000-item
fan-out drowns another org's single run; (3) two relays watching the same resource were double-polling
(flaw #3, planted S06).

## Decision
- **Vendor governor: a shared token bucket per connection.** Every vendor call passes it (the S03
  `ctx.http` chokepoint makes this enforceable). The bucket is **shared state (Redis)** so all
  workers/orgs on one connection draw from one budget; the take must be **atomic** (a Lua script) or the
  bucket lies under concurrency. The governor **learns**: a `Retry-After` from a 429 drains the bucket and
  defers refill — the vendor tells you its real rate, so listen instead of guessing.
- **Weighted fair queuing across orgs, with reserved minimums.** Serve the org with the lowest
  `inFlight / weight` ratio among those under their cap. Higher tiers (weight) get proportionally more
  throughput; a low-traffic org is never starved by a high-traffic one.
- **Priority lanes: interactive > scheduled > bulk, no lane fully starves.** A human waiting on a test-run
  has a different SLA than a nightly backfill — encode it, or the queue decides badly. The lowest lane
  gets a reserved minimum so bulk work isn't starved to death.
- **Shared trigger subscriptions (flaw #3 harvest).** A subscription's identity is the **resource** —
  `(connection, connector, trigger)` — never the relay. Re-keying the cursor to the resource means one
  poll, one cursor, fanned out to every relay bound to it. Getting the identity right dissolves the
  duplication.

## Alternatives considered
- **Per-worker or per-org rate buckets.** Simple, and *wrong*: they silently multiply the vendor's real
  limit by N and get the shared account banned. The limit is the vendor's; the bucket must be too.
- **Non-atomic check-then-decrement take.** Races across workers — two both see "1 left" and both take it.
  This is the same distributed-counter race as seq assignment and invoice numbers, in a new costume; the
  Redis take MUST be atomic.
- **Reject-when-over vs. queue-and-delay (the debate).** Reject is honest backpressure but fails user
  runs on load; unbounded queues hide problems and blow latency SLAs. **Resolution:** queue with a
  *bounded* wait and a visible "delayed — waiting on vendor limit" run state; reject only past the
  ceiling. *Delay is kinder than failure until the wait itself becomes the failure — make the boundary
  visible.*

## Consequences
- Aggregate calls to a vendor stay under its limit even under multi-org load (the farm's 429 injection
  validates this honestly).
- One org's huge fan-out no longer delays another org's single run beyond SLA.
- **Flaw #3 closed:** two relays on one sheet now share one poll and one cursor.
- The rate/fairness signals (budget usage, org concurrency, queue depth by lane) become **S15's alerting
  surface**.

## Links
- `apps/engine/src/fairness/{token-bucket,scheduler}.ts` (+ tests), `apps/engine/src/triggers/cursor.ts`
  (subscriptionKey), ADR-0005 (the http chokepoint), `docs/sprints/sprint-11.md`
