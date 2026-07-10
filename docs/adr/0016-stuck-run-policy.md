# ADR-0016: Stuck-run policy — auto-timeout to retriable-failed + per-connector circuit breaker

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S15
- **Deciders:** Relay authors

## Context
The classic automation-engine outage: a vendor hangs (not an error — a socket that never responds), so
steps wait *forever*, workers fill with stuck runs, and one bad vendor takes down everyone's automations.
A wall-clock timeout is necessary but not sufficient — the interesting question is what the timeout leads
*to*.

## Decision
- **Detect stuck runs** by expected-duration × grace factor, backed by a heartbeat per active step (to
  tell "slow" from "dead"). A step past its budget is auto-timed-out.
- **Auto-timeout to a RETRIABLE-FAILED state**, not a hard fail and not a blind retry. Hard-fail loses
  legitimately-slow runs; blind retry re-hits the same hung vendor.
- **Per-connector circuit breaker.** A degraded connector trips a breaker after N failures; while open it
  **holds** that connector's runs briefly (instead of pounding a vendor that's already down), then allows
  one **half-open probe** to test recovery — success closes it, a failed probe re-opens. So one hung
  vendor's runs back off on *their* connector without starving healthy ones.

## Alternatives considered
- **Auto-timeout-and-fail (hard).** Clean and simple, but a genuinely slow-but-fine run (a big export)
  gets killed and marked failed — data loss / false alarms. Timeouts shouldn't be verdicts.
- **Auto-timeout-and-retry (blind).** Retries straight back into the same hung vendor, amplifying the
  pileup — you've built a tighter loop around the exact problem.
- **Hold-for-human on every stuck run.** Safest, but needs human capacity that doesn't exist at 3am, and a
  vendor blip becomes a queue of manual tickets. The breaker automates the common case (transient
  degradation) and escalates only sustained failures.

## Consequences
- A hung vendor degrades *its own* connector's throughput (breaker open) without consuming the whole
  fleet or failing healthy connectors' runs.
- Retriable-failed runs land in the DLQ, where **safe bulk replay** (S07 idempotency) can re-run them
  after the vendor recovers — 10,000 dead-lettered runs replay without 10,000 duplicate side effects. The
  durable-execution investment pays off at ops scale.
- **Drills validate thresholds, not just mechanisms:** the incident drill found stuck-detection existed
  but its alert threshold was too slow, and tightened it. A drill that changes no config was theater.

## Links
- `apps/engine/src/observability/breaker.ts` (+ tests), `docs/runbooks/`,
  `docs/postmortems/2026-07-09-vendor-hang-pileup.md`, ADR-0009 (durable execution), ADR-0013 (rate
  limits), `docs/sprints/sprint-15.md`
