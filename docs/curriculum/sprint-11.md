# Curriculum Note — Sprint 11: Rate Limits & Fairness

## Learning objectives
- Respect a **shared** vendor rate limit without getting the account banned.
- Build **multi-tenant fairness** so no org starves another; encode SLA via priority lanes.
- Harvest flaw #3 by getting **subscription identity** right.
- Recognize the distributed-counter race for the fourth time and handle it.

## Key concepts
- **The rate limit is the vendor's, so the bucket is shared.** A vendor limits *per account*; all your
  orgs on one connection share that budget. The seductive bug is per-worker or per-org buckets — each
  looks correct locally, and together they multiply the real rate by N and earn a ban. One connection,
  one bucket, shared across all workers (Redis in prod).
- **The atomic-take race, again.** `tryTake` is check-then-decrement. In one JS process that's atomic;
  across workers it races — two both read "1 token left," both take it, and the bucket has lied. This is
  the *same* race as sequence assignment (S06) and invoice numbers — a distributed counter in a new
  costume. The Redis take MUST be atomic (a Lua script). Once you've seen this shape a few times, you
  spot it instantly: any "read a shared count, then act on it" across processes needs atomicity.
- **Retry-After is feedback, not just a delay.** The vendor tells you its real rate every time it 429s.
  A governor that *learns* — drains the bucket and defers refill on a 429 — beats a statically-configured
  guess that's either too timid (wasted throughput) or too aggressive (bans).
- **FIFO is unfair under skew.** One org's 10,000-item fan-out ahead of another org's single run means
  the single run waits forever. Weighted fair queuing serves the lowest `inFlight / weight` ratio, so a
  quiet tenant is never starved and paid tiers get proportionally more. Fairness is a scheduling policy,
  not an accident of arrival order.
- **Priority lanes with reserved minimums.** Not all runs have the same SLA: a human waiting on a
  test-run ≠ a nightly backfill. Serve interactive first — but reserve a minimum for bulk so it can't be
  starved to death. Encode the priority, or the queue encodes it for you, badly.
- **Subscription identity dissolves duplication (flaw #3).** The cursor was keyed by *relay*, so two
  relays on one sheet double-polled. But a subscription IS the resource — `(connection, connector,
  trigger)`. Re-key to the resource and the duplication vanishes: one poll, one cursor, fanned to many
  relays. When you find duplication, check whether you keyed by the wrong identity.

## The debate, cashed
**Reject-when-over vs. queue-and-delay.** Resolved: queue with a *bounded* wait + a visible "delayed —
waiting on vendor limit" run state; reject only past the ceiling. *Delay is kinder than failure until the
wait itself becomes the failure — make the boundary visible.*

## Ledger
- **Flaw #3 CLOSED.** Per-relay cursor → per-(connection, resource) shared subscription.

## Exercise questions
1. Why do per-org rate buckets get the shared vendor account banned? Work the math for 50 orgs on one
   connection against a 100-req/min vendor limit.
2. Show the atomic-take race with two workers and one remaining token. Why does a Lua script fix it and a
   read-then-write not?
3. Under weighted fair queuing, org A (weight 1, 5 in-flight) and org B (weight 1, 0 in-flight, 1
   pending): who's served next, and why is that fair?
4. Flaw #3 was "cursor per relay." What was the *right* identity, and what general lesson does that teach
   about duplicate work?

## Lab (`lab/sprint-11`, break-it)
Two orgs hammer one shared connection; prove the aggregate stays under the farm's limit. Then remove the
shared-state governor on a branch and watch the farm start issuing 429 storms and bans.

## Further reading
- Token bucket / leaky bucket · Distributed rate limiting (Redis + Lua atomicity) · Weighted fair
  queuing / WFQ · Priority scheduling & starvation · Noisy-neighbor isolation in multi-tenant systems
