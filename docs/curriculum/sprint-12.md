# Curriculum Note — Sprint 12: Run Debugging & Metering

## Learning objectives
- Build the **highest-leverage debug feature** in a mapping tool: the expression resolution trace.
- Treat a **billing definition as a contract**, and enforce it idempotently.
- Suppress **alert storms** and design **humane quota limits**.

## Key concepts
- **The resolution trace kills support tickets.** The #1 question in any mapping tool is "why did my
  mapping produce *that*?" Answer it by showing the value each `{{ref}}` resolved to — "this
  `{{steps.0.output.email}}` became `ada@corp.com`." Users debug their own logic and stop opening
  tickets. It's a single pass (a trace must show the truth, never re-expand), and it's sampled/on-demand
  in production because tracing every render is too expensive.
- **A billing definition is a load-bearing product decision disguised as a counter.** "What is a task?"
  is not a `count++` — it's a contract customers will litigate. So the edges are enumerated (ADR-0014):
  successful action steps bill; triggers, filters, halted branches, failures, and retries don't. Write
  the definition you can defend to an angry customer, then encode exactly that.
- **Metering must be idempotent — the S07 instinct, applied to money.** A retry that eventually succeeds
  is ONE task, not three; a replay-to-debug is FREE. Keyed on `(runId, stepId)`, deduped in code AND by a
  `@@unique` constraint in the database. Double-counting a bill is the money version of a double-sent
  email — and it's stopped the same way: an idempotency key.
- **Alerting must itself be rate-limited.** A relay failing 1,000×/hour that sends 1,000 alerts is a spam
  cannon that trains builders to mute you — so the failure notification is *itself* a thing that can
  storm. First failure alerts immediately; the rest fold into a digest. (The herd-suppression pattern,
  alerting-shaped.)
- **Humane limits.** Hard-pausing a relay means missed business events (an order not synced). So
  soft-warn at 80%, hard-pause only at the limit, with a clear notification and easy resume. A cliff with
  no warning is technically correct and a terrible product.
- **Measure before you promise.** Per-relay success rate, p95 duration, and error breakdown are what a
  builder needs — and the p95s feed S15's SLOs. The tail (p95), not the mean, is what users feel.

## The debate, cashed
**Meter successful actions only vs. all attempts.** Resolved: bill successful action steps; retries and
failures are free (we absorb our own unreliability). *Metering policy is where engineering meets trust;
pick the definition you can defend to an angry customer.*

## Exercise questions
1. A step fails twice (vendor down), then succeeds on attempt 3, and the user later replays the run once.
   How many tasks are billed? Show the two mechanisms that keep it at one.
2. Why meter successful actions and not attempts, given attempts reflect our real cost? What does the
   decision optimize for, and what does it cost us?
3. A relay fails 1,000 times in an hour. How many alerts, and what does the builder actually receive?
4. Why soft-warn before hard-pause? Give the business event a no-warning hard cap would silently drop.

## Deferred
Relay-level SLA reports · cost-attribution by connector · anomaly detection on failure spikes · the rich
run-debugger UI panels (the trace + metering data model land here).

## Further reading
- Usage-based billing & idempotent metering · Sampled tracing · Alert fatigue & storm suppression ·
  Percentile SLIs · Humane rate limits / graceful degradation
