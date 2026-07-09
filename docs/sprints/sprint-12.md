# Sprint 12 — Run Debugging & Metering

**Branch:** `sprint-12/debugging-metering` · **Size:** M/L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** Make failures diagnosable and usage billable. A rich run-debugging surface (step I/O diffing, error drill-down, one-click replay), failure alerting to builders, and task metering — the "how automation platforms charge" sprint.

## A — Issues
1. `Run debugger: step I/O inspection, expression-resolution trace, error context, replay-from-step`
2. `Failure alerting: notify builders on relay failures (thresholds, digests) via S-fast-forward email`
3. `Task metering: define a "task", count them, usage dashboard, quota enforcement`
4. `Relay health: success rate, p95 duration, error breakdown per relay`

## B — Commits
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(web): run debugger — per-step input/output panels, expression resolution trace ("this {{ref}} became X")` | the expression trace is the killer feature: users debug *their* mappings, the #1 support burden |
| 2 | `feat(engine): capture resolution trace during render (behind a per-run debug flag; sampled in prod)` | 🔗 Pulse's sampled-tracing lesson: tracing every render is too much; sample + on-demand |
| 3 | `feat(web): replay-from-step — re-run starting at a chosen node with edited input (dry-run default)` | 🔗 S7 replay + S8 DAG: replay from an arbitrary node = checkpoint seeding |
| 4 | `feat(api+jobs): failure alerting — per-relay thresholds, immediate vs digest, dedupe alert storms` | a relay failing 1,000×/hour sends *one* alert, not 1,000 (🔗 Pulse S13 herd lesson, alerting-shaped) |
| 5 | `feat(db+engine): task metering — UsageRecord per billable unit; "task" definition documented precisely` | what counts: each successful action step? filtered-out steps? retries? — the definition is a *product+billing contract*, written explicitly |
| 6 | `feat(api+web): usage dashboard + quota enforcement (soft warn, hard pause relays at limit)` | 🔗 Pulse S15 self-metering parallel; hard-limit pauses relays with builder notification |
| 7 | `feat(api): relay health metrics — success rate, p95, error-class breakdown` | |
| 8 | `test: metering correctness (retries don't double-count; filtered steps don't count); alert dedupe; quota pause/resume` | |
| 9 | `docs: ADR-0014 what-is-a-task metering policy; curriculum note` | |

## C — Review order
The resolution trace (1–2) → task definition (5, read the ADR) → replay-from-step (3) → metering correctness tests (8).

## D — Teaching comments (~9)
- resolution trace — 📘 the highest-leverage debug feature in a mapping tool: show the *value each expression produced*; support tickets evaporate; sampling keeps it affordable
- what-is-a-task — 🔍 review-lens: billing definitions are load-bearing product decisions disguised as counters; does a retry count? a filtered branch? the ADR must be unambiguous because customers will litigate it; edge cases enumerated
- metering ≠ double-count — ⚠️ retries and replays must not inflate bills; idempotent metering keyed on (run, step) — the S7 idempotency instinct, applied to money
- alert dedupe — 📘 alerting on a failing relay must itself be rate-limited; the storm-suppression pattern (first + digest), or you've built a spam cannon
- quota pause semantics — 📘 hard limits on automation are scary (paused relays = missed business events); soft-warn-first, clear notification, easy resume — the humane-limits UX
- health p95 — 🔗 per-relay percentiles feed S15 SLOs; measure before you promise

## E — Debate
**"Meter successful actions only vs all attempts?"** Attempts: reflects real vendor load we incur. Success-only: intuitive to customers ("I pay for work done"). **Resolution:** successful action steps are billable; retries/failures are free (we absorb the cost of our own unreliability) — a customer-trust decision with a real margin cost, made deliberately and documented. Lesson: *metering policy is where engineering meets trust; pick the definition you can defend to an angry customer.*

## F/G — Close
- Squash: `feat(sprint-12): run debugging, alerting, metering (closes #…)`
- Deferred: relay-level SLA reports, cost-attribution by connector, anomaly detection on failure spikes.
- Recap idea: *two audiences need the truth about a run — the builder (what happened) and the invoice (what it cost) — and both must be exactly right.*
