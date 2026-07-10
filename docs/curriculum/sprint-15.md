# Curriculum Note — Sprint 15: Production Readiness → v1.0.0

## Learning objectives
- Operate a workflow engine: run-lifecycle observability, stuck-run handling, safe recovery.
- Turn a timeout into a **policy**, not a verdict.
- See the durable-execution investment pay off as **safe bulk replay** at ops scale.
- Ship a release and write the course's synthesis.

## Key concepts
- **You can't fix automations you can't see — and the BREAKDOWN is the feature.** An aggregate failure
  rate ("3% failing") tells you nothing. Break failures down by **connector AND error class** and a
  degraded vendor announces itself ("MailPost is 40% RateLimited") before customers open tickets.
  Run-lifecycle tracing stitches trigger→queue→engine→vendor by run id, and vendor spans carry the
  rate-governor wait time — so a "slow" run that was queued behind a vendor's rate limit is visibly
  different from one where our engine is struggling.
- **A timeout is the start of a policy, not the end.** A step on a hung vendor waits forever and consumes
  the fleet. Detection + auto-timeout is necessary — but *what does the timeout lead to?* Not a hard fail
  (loses legitimately-slow runs), not a blind retry (re-hits the hung vendor). It leads to a
  **retriable-failed** state plus a **per-connector circuit breaker**: a degraded vendor trips the
  breaker, which holds *its* runs briefly and probes for recovery, so one bad vendor degrades its own
  throughput without starving healthy connectors. (ADR-0016.)
- **The whole course pays off in safe bulk replay.** After a vendor recovers, you can replay 10,000
  dead-lettered runs and get **zero duplicate side effects** — because every side effect carries an
  idempotency key (S07). Without that investment, DLQ replay is Russian roulette. The durable-execution
  work you did in Sprint 7 is what makes mass recovery *boring*, which is exactly what you want at 3am.
- **Encrypted backups are only as recoverable as their key custody.** A restored database without its
  master KEK is landfill — the wrapped DEKs won't unwrap, so no connection can decrypt its tokens. The
  restore runbook covers KEK availability across your entire retention window. Envelope encryption's
  operational tail (S02/S13).
- **Drills validate thresholds, not just mechanisms.** The vendor-hang drill found that stuck-run
  detection *worked* but its alert fired *after* customer-visible impact. A drill that changes no config
  is theater — the point is to discover the gap between "the mechanism is correct" and "we got paged in
  time."

## The debate, cashed
**Stuck-run policy: auto-fail vs. auto-retry vs. hold-for-human.** Resolved: auto-timeout to
retriable-failed + a per-connector circuit breaker with backoff. *Timeouts are the start of a policy, not
the end — decide what the timeout leads to.*

## Exercise questions
1. Why break failure metrics down by connector *and* error class? Give an incident that an aggregate rate
   would hide and the breakdown would surface immediately.
2. Trace the stuck-run policy: a step hangs on MailPost. Walk timeout → retriable-failed → breaker →
   DLQ → replay. What does each stage prevent?
3. Why is bulk-replaying 10,000 dead-lettered runs safe here and catastrophic in a system without
   idempotency keys?
4. You restore last month's DB but rotated the KEK two weeks ago. What breaks, and what does the KEK
   rotation runbook say about retention?

## Release
merge → deploy → smoke (webhook→run→vendor) → tag **`v1.0.0`** → GitHub Release → recorded demo (a
branching relay with a code step, live) → close milestone.

## Further reading
- Google SRE: SLIs/SLOs, alerting on symptoms not causes · Circuit breakers (Hystrix) · Dead-letter
  queues & idempotent replay · Blameless postmortems · Backup/restore with encryption key custody
