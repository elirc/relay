# Sprint 15 — Production Readiness → v1.0.0

**Branch:** `sprint-15/production-readiness` · **Size:** L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** Operate a workflow engine: run-lifecycle observability, engine/queue health, a stuck-run incident drill, dead-letter triage tooling, backup/restore, and the v1.0 release with course retrospective. The theme — you can't fix automations you can't see.

## A — Issues
1. `Observability: run-lifecycle tracing, engine metrics (queue depth, step latency, retry/failure rates), Sentry`
2. `Alerting: failed-run spikes, queue backlog, DLQ growth, stuck runs, vendor-error surges`
3. `Ops: graceful engine drain (S7), DLQ triage + bulk replay UI, backup/restore drill`
4. `Incident drill: stuck-run pileup (a hung vendor) → detection → drain → recovery; runbooks`
5. `Release: changelog, v1.0.0, course + curriculum retrospective`

## B — Commits
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(obs): run-lifecycle tracing — trigger → enqueue → each step → vendor call → completion, correlated by run id` | one trace answers "where is this run and why is it slow"; vendor-call spans carry the connector + rate-governor wait time |
| 2 | `feat(obs): engine metrics — queue depth by lane, step latency p95, retry rate, failure rate by error class + by connector` | error-class + per-connector breakdown surfaces "MailPost is degraded" before customers do; dashboard JSON committed |
| 3 | `feat(obs): Sentry — engine + api, with run/relay/connector context; secrets scrubbed (S13 rules)` | |
| 4 | `feat(api+web): DLQ triage — inspect dead-lettered runs, categorize, bulk-replay after fix (S7 replay + idempotency = safe bulk replay)` | 🔗 the durability investment makes mass replay safe — the S7 payoff at ops scale |
| 5 | `feat(engine): stuck-run detection — runs exceeding expected duration flagged; heartbeat per active step` | a step waiting on a hung vendor forever is the classic pileup; detection + auto-timeout + alert |
| 6 | `feat(engine): graceful drain finalized (S7) — deploy-safe, in-flight runs checkpoint + requeue` | zero-downtime deploy verified with a mid-run E2E |
| 7 | `feat(obs): alerting — failed-run spike, queue backlog by lane, DLQ growth, stuck-run count, vendor-error surge` | page on symptoms (customer-visible failures), ticket on causes |
| 8 | `feat(ops): backup + tested restore — runs, checkpoints, connections (encrypted); restore drill on staging` | restoring encrypted connections needs the KEK — the restore runbook covers key availability (a restored DB without its KEK is landfill) |
| 9 | `test(drill): incident — a vendor hangs (farm latency knob = ∞) → runs pile up → detection → drain stuck lane → recover` | executed for real; the farm's infinite-latency knob is the weapon; postmortem-worthy |
| 10 | `docs: postmortem — vendor-hang pileup (blameless); action items as issues` | finding: stuck-run detection existed but the alert threshold was too slow; tightened |
| 11 | `docs: runbooks — stuck runs, DLQ triage, vendor outage, queue backlog, connection-mass-revocation, restore, rollback` | |
| 12 | `chore(release): changelog; staging/prod docs; README refresh` | |
| 13 | `docs: course retrospective — durable-execution arc, the idempotency tally across sprints, the flaw ledger story, v2 ideas (Temporal adoption, connector marketplace, visual debugger)` | |

## C — Review order
Run-lifecycle trace (1) → stuck-run detection (5) → DLQ bulk-replay (4, note why it's safe) → the drill story (9→10).

## D — Teaching comments (~9)
- run-lifecycle trace — 📘 a run crosses trigger, queue, engine, sandbox, and vendors; the trace stitches them by run id; the rate-governor wait time on vendor spans explains "slow" runs that aren't our fault
- per-connector failure metrics — 🔍 review-lens: aggregate failure rate hides the story; break down by connector + error class and vendor degradations announce themselves
- safe bulk replay — 🔗 the whole course pays off here: S7 idempotency means you can replay 10,000 dead-lettered runs after a fix without 10,000 duplicate side effects; without it, DLQ replay is Russian roulette
- stuck-run detection — ⚠️ the pileup pattern: unbounded waits on external systems; heartbeats + expected-duration + auto-timeout; a hung vendor must not consume the fleet
- restore needs the KEK — 📘 encrypted backups are only as recoverable as their key custody; the runbook that forgets the KEK restores landfill (🔗 S2/S13 envelope encryption's operational tail)
- drill finds the gap — 📘 the detection existed but was too slow — drills validate thresholds, not just mechanisms; a drill that changes no config was theater

## E — Debate
**"Stuck-run policy: auto-timeout-and-fail vs auto-timeout-and-retry vs hold-for-human?"** Fail: clean, but loses legitimately-slow runs. Retry: may re-hit the same hung vendor. Hold: safe, but needs human capacity. **Resolution:** auto-timeout to a *retriable failed* state with backoff + circuit-breaker per connector (a degraded vendor trips the breaker, holding its runs briefly rather than hammering it). Lesson: *timeouts are the start of a policy, not the end — decide what the timeout leads to.*

## F/G — Close & Release
- Squash: `feat(sprint-15): engine observability, DLQ triage, incident readiness (closes #…)`
- **Release sequence:** merge → deploy → smoke (webhook→run→vendor E2E vs prod) → tag **`v1.0.0`** → GitHub Release → recorded demo (a multi-step branching relay with a code step, live) → close milestone.
- Final discussion: **course retro** — the S5→S7 durable-execution reckoning reviewed; the idempotency tally (SDK declarations, engine keys, metering, DLQ replay); learner's certified connector celebrated; pointer to course 5 (Harbor / Folio).
- Recap idea: *operating an automation engine is watching one promise at scale — every run resumes correctly, or you get paged before the customer notices.*
