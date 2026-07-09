# Sprint 11 — Rate Limits & Fairness

**Branch:** `sprint-11/rate-limits-fairness` · **Size:** L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** Be a good API citizen and a fair multi-tenant host. Respect each vendor's rate limits (shared across all orgs using that vendor), stop one org's 10,000-item fan-out from starving everyone, and share trigger subscriptions so two relays on one resource don't double-poll (harvesting the per-relay cursor flaw).

## A — Issues
1. `Vendor rate governor: token-bucket per (vendor, connection), Retry-After aware, shared queue`
2. `Fairness: per-org concurrency + weighted scheduling so no tenant monopolizes workers`
3. `Shared trigger subscriptions: one poll/webhook per (connection, resource), fan to many relays`
4. `Priority: interactive test-runs jump ahead of bulk fan-outs`

## B — Commits
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(engine): vendor rate governor — token bucket per connection, refill from vendor limits + Retry-After feedback` | the S3 http helper is the chokepoint (as designed): every vendor call passes the governor; 429s teach the bucket its real rate |
| 2 | `feat(engine): governor is shared state (redis) — all workers/orgs on one connection share one budget` | ⚠️ per-worker buckets would N× the real limit; distributed token bucket, Lua for atomic take |
| 3 | `feat(engine): per-org concurrency caps + weighted fair queuing across orgs` | BullMQ priorities + per-org in-flight accounting; the noisy-neighbor fix (🔗 Pulse S12 per-project concurrency, engine-shaped) |
| 4 | `refactor(engine): shared trigger subscriptions — key by (connection, resource), fan out to bound relays` | **harvests flaw #3**, ledger quoted; two relays on one sheet now share one cursor and one poll; dedupe evidence in body |
| 5 | `feat(engine): priority lanes — interactive test-runs > scheduled runs > bulk fan-out backfills` | starvation guard: low lane gets a reserved minimum (no lane fully starves) |
| 6 | `feat(web): rate/fairness observability — per-connection budget usage, org concurrency, queue depths by lane` | 🔗 becomes S15's alerting surface |
| 7 | `test(engine): shared budget under multi-org load — aggregate calls never exceed vendor limit (farm enforces + rejects overage)` | the farm's 429 injection validates the governor honestly |
| 8 | `test(engine): fairness — one org's 5,000-item fan-out doesn't delay another org's single run beyond SLA` | |
| 9 | `test(engine): shared subscription — two relays, one resource → one poll, both fire, no dupes` | |
| 10 | `docs: ADR-0013 distributed rate limiting + fair scheduling; curriculum note` | |

## C — Review order
Distributed token bucket (1–2) → fair queuing (3) → shared subscriptions (4) → the multi-org fairness test (8).

## D — Teaching comments (~10)
- shared budget — 📘 the subtle multi-tenant bug: rate limits are the *vendor's* per-account limit, so all your orgs on one connection share it; per-worker or per-org buckets silently overshoot and get you banned
- atomic take — ⚠️ check-then-decrement across workers races; Lua/atomic op or the bucket lies; 🔗 every course has met this race (Meridian invoices, Tracer seq, Pulse merge) — same shape, distributed-counter costume
- Retry-After as feedback — 📘 the vendor tells you its real rate via 429s; a governor that *learns* from Retry-After beats a statically-configured guess
- fair queuing — 📘 FIFO is unfair under skew; weighted fairness + reserved minimums so bulk work yields to interactive without fully starving
- shared subscriptions — 🔍 review-lens: flaw #3 was "cursor per relay"; the fix re-keys to the resource — the *identity* of a subscription is (connection, resource), never (relay); getting identity right dissolves the duplication
- priority lanes — 📘 not all runs are equal; a human waiting on a test-run has different SLA than a nightly backfill; encode it or the queue decides for you, badly

## E — Debate
**"Rate limiting: reject-when-over (429 the run) vs queue-and-delay?"** Reject: backpressure honesty, but user runs fail on load. Queue: smooth, but unbounded queues hide problems and blow latency SLAs. **Resolution:** queue with a bounded wait + visible "delayed, waiting on vendor limit" run state; reject only past the ceiling. Lesson: *delay is kinder than failure until the wait itself becomes the failure — make the boundary visible.*

## F/G — Close
- Squash: `feat(sprint-11): vendor rate limits, fairness, shared subscriptions (closes #…)`
- **Lab (break-it):** two learner-driven orgs hammer one shared connection; the learner proves the aggregate stays under the farm's limit, then removes the shared-state governor on a branch and watches the farm start issuing bans (429 storms).
- Ledger: flaw #3 closed.
- Recap idea: *fairness and rate-limiting are the same problem viewed from two sides — one budget, many claimants, shared atomically.*
