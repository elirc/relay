# Sprint 01 — Foundation: The Hardcoded Two-Step Relay

**Branch:** `sprint-01/foundation` · **Size:** S · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** Fast-forward scaffold; the walking skeleton is one hardcoded automation running end to end: an inbound webhook triggers a run that executes one HTTP action, with the run and its steps recorded. Every abstraction the course builds is visible here in embryo.

## A — Issues
1. `Monorepo scaffold: apps/{web,api,engine}, packages/{db,shared,config}`
2. `Walking skeleton: POST /hooks/demo → Run → one HTTP-request step → RunEvent log`
3. `CI + governance (fast-forward)`
4. `ADR-0001 engine as dedicated worker app; ADR-0002 run state in Postgres`

## B — Commits
| # | Commit | Notes |
|---|--------|------|
| 1 | `chore: monorepo scaffold (fast-forward, compressed)` | |
| 2 | `feat(db): Relay, Run, StepRun, RunEvent models (minimal columns)` | RunEvent is append-only from day one — the execution log precedes the execution engine |
| 3 | `feat(api): POST /hooks/demo — creates Run, enqueues execution job` | |
| 4 | `feat(engine): worker — picks up run, executes hardcoded HTTP step, records StepRun + events` | one file, deliberately naive; no retries, no checkpoints — the "before" photo |
| 5 | `feat(web): shell + run list + run detail (step statuses, event log)` | run history UI exists before the builder does — debugging surface first |
| 6 | `test: hook → run → step executed → events recorded (integration)` | |
| 7 | `ci: pipelines + branch protection (fast-forward)` | |
| 8 | `docs: ADR-0001 dedicated engine app; ADR-0002 run state in PG (not Redis)` | runs are business records: queryable, durable, auditable — Redis holds *work*, PG holds *truth* |
| 9 | `docs: curriculum note sprint 01` | |

## C — Review order
ADR-0002 → the naive engine (4) → RunEvent design (2).

## D — Teaching comments (~8)
- RunEvent append-only — 📘 execution logs are the product in an automation tool; users debug *their* logic with *your* events; 🔗 the Tracer mutation log instinct, applied to workflow execution
- runs in PG, jobs in Redis — 📘 the queue is a conveyor, not a filing cabinet; if Redis died mid-run, what must survive? (that question is S7's whole plot)
- naive engine — 🔍 review-lens: enumerate what's missing (retry, checkpoint, idempotency, timeout) — that list is the course syllabus, and the S5 in-PR arc will demonstrate the worst omission
- history-before-builder — 📘 sequencing choice: observability surfaces first make every later sprint self-demonstrating

## E — Debate
**"Execution state machine in the DB vs a workflow library (Temporal-shaped)?"** Temporal: durable execution solved — and the entire learning objective outsourced. Hand-rolled: we meet every problem Temporal exists to solve, personally. **Resolution:** hand-rolled on BullMQ+PG; the ADR maps each future sprint to the Temporal concept it re-derives (activities, checkpoints, replay) so the learner can adopt such tools *knowingly* later. Lesson: *use frameworks after you've earned the pain they remove — or at least understand it.*

## F/G — Close
- Squash: `feat(sprint-01): foundation — hardcoded relay end to end (closes #…)`
- Recap idea: *everything Relay will become is this one file grown up — reread commit 4 at S15 and laugh.*
