# ADR-0014: What is a billable "task" (metering policy)

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S12
- **Deciders:** Relay authors

## Context
We bill by "tasks." That word is where engineering meets trust: it's a `count++` in the code and a line
on an invoice a customer will scrutinize. Ambiguity here becomes a dispute — "why was I charged for a
step that failed?" So the definition must be explicit, defensible to an angry customer, and enforced so
retries and replays can't inflate it.

## Decision
**A task = one SUCCESSFUL action step.** Precisely:
- **Billable:** an action step that completes successfully.
- **NOT billable:** triggers, filter/condition nodes, steps in a branch that was halted, failed steps,
  and **retries** (a step that succeeds on attempt 3 is one task, not three).
- **Idempotent by (runId, stepId).** Metering is keyed on the run+step, deduped in code AND enforced by
  a `@@unique([runId, stepId])` on `UsageRecord`. A retry, a resume, or a replay of the same step
  physically cannot double-bill — the S07 idempotency instinct, applied to money.

Quota: **soft-warn at 80%, hard-pause at 100%**, with a clear builder notification and easy resume.

## Alternatives considered
- **Meter all attempts (retries/failures included).** This reflects the real vendor load we incur, and is
  arguably "fairer" to us. But it charges customers for *our* unreliability — a step that failed twice
  because the vendor was down, then succeeded, would bill 3×. Customers can't predict or control that, so
  it reads as a penalty for our flakiness. **We absorb retry/failure cost** — a real margin decision made
  deliberately, in exchange for a billing model customers can reason about and trust.
- **Meter every step (including filters/triggers).** Simpler to count, but it charges for plumbing the
  user didn't think of as "work," inviting disputes. Only the action — the thing that *did something to
  the outside world* — is a task.
- **Hard-pause with no warning.** Operationally simplest, but hard limits on automation are scary: a
  paused relay is a missed business event (an order not synced, a lead not routed). Soft-warn-first is the
  humane-limits UX.

## Consequences
- Bills are predictable and defensible: a customer can look at their run history and count their tasks.
- We eat the cost of retries/failures — acceptable, and it aligns our incentives (make the engine
  reliable) with the customer's.
- The `(runId, stepId)` uniqueness is load-bearing: it's the difference between "replay to debug" being
  free and being a surprise charge.

## Links
- `packages/shared/src/metering.ts` (+ tests), `packages/db` `UsageRecord`, ADR-0007 (idempotency),
  `docs/sprints/sprint-12.md`
