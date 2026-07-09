# Sprint 07 — Engine v2: Durable Runs (Flagship)

**Branch:** `sprint-07/durable-engine` · **Size:** XL · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** The reckoning promised in S5. Rebuild the engine around durable execution: per-step checkpoints, resume-exactly-where-it-stopped, and **enforced idempotency** so a resumed run never re-fires a completed side effect. Then replay. The duplicate-email test from S5 becomes green, permanently.

## A — Issues
1. `Checkpoint model: each step's completion durably recorded before advancing`
2. `Resume: on restart, replay from checkpoints — completed steps return cached output, never re-execute`
3. `Idempotency enforcement: the S3 declarations become runtime guarantees`
4. `Replay: re-run a historical run with same/new version for debugging`

## B — Commits (three acts)
### Act 1 — Checkpoints
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(db): StepRun becomes a checkpoint — status, attempt, output ref, idempotencyKey, committedAt` | the state machine per step: PENDING→RUNNING→SUCCEEDED/FAILED, transitions audited (🔗 Meridian S4 state-machine discipline, engine-scoped) |
| 2 | `refactor(engine): execution loop reads checkpoints — a step runs only if not already SUCCEEDED` | the resume primitive; completed steps rehydrate output from the ref |
| 3 | `test(engine): the S5 duplicate-email scenario — crash after send, restart → NO second email` | **the flagship green:** ledger/S5-arc closed; the test that defines the sprint |

### Act 2 — Idempotency as guarantee
| # | Commit | Notes |
|---|--------|------|
| 4 | `feat(engine): idempotency key derivation per step from the connector's declared strategy` | `vendorKey` → deterministic key sent as Idempotency-Key header; `naturalKey` → hash gate checked before execute; `dedupeWindow` → short-TTL seen-set |
| 5 | `feat(connectors): send-email/add-row honor engine-provided idempotency keys against the farm` | the farm respects Idempotency-Key (MailPost) and rejects dupes (SheetLite natural key) — proving all three strategies end to end |
| 6 | `test(engine): the ugly window — crash BETWEEN vendor-ack and checkpoint-commit → resume detects via idempotency, no duplicate` | S5's *unclosed* window (its honest partial fix) now closed; the two-phase reasoning spelled out: side effect carries the key, so replay is safe even when our record is missing |
| 7 | `feat(engine): non-idempotent-by-nature steps (e.g., ChatBox post) → dedupeWindow + at-least-once warning surfaced to builder` | honesty in the UI: some actions can only be at-least-once; say so |

### Act 3 — Replay
| # | Commit | Notes |
|---|--------|------|
| 8 | `feat(engine): replay — clone a run's trigger payload, execute against pinned or latest version` | replay is checkpoint-resume with a fresh run id; side effects gated by *replay mode* (dry-run vs live, explicit choice) |
| 9 | `feat(web): replay UI from run history — "re-run with same input", version selector, dry-run toggle` | |
| 10 | `test(engine): replay determinism — same input + same version → same rendered inputs (side effects gated)` | |
| 11 | `feat(engine): graceful shutdown — checkpoint current step, requeue run, drain (SIGTERM)` | deploys stop being incidents (🔗 Tracer/Pulse S15 law, arriving early because the engine demands it) |
| 12 | `docs: ADR-0009 durable execution model (the Temporal concept map from S1, now realized); curriculum note` | |

## C — Review order
Checkpoint model (1) → resume loop (2) → **the flagship test (3)** → idempotency derivation (4) → **the ugly-window close (6)** → replay (8).

## D — Teaching comments (~14)
- checkpoint-before-advance — 📘 durable execution's one rule: never take step N+1's word for step N; the checkpoint is a promise you can crash against
- rehydrate not re-execute — 📘 resumed completed steps return stored output; this is why outputs are persisted (and why they got big — 🔗 flaw #2, harvested S10)
- flagship test (3) — 🔍 review-lens: compare to S5 commit 5's identical scenario; the diff between the two test outputs is the sprint's entire value
- three idempotency strategies — 📘 the S3 declaration was a promise; here it becomes mechanism: vendor-key (best — vendor dedupes), natural-key (we dedupe before calling), dedupe-window (we mostly dedupe, and admit the gap)
- the ugly window (6) — ⚠️ the deepest lesson in the course: our DB and the vendor's DB commit at different instants; only a key that travels *with the side effect* survives the gap; this is why "just resume from our last write" (S5's partial fix) can't be enough
- at-least-once honesty — 📘 when exactly-once is impossible (non-idempotent vendor), the product must *say* "may run twice" — engineering honesty as UX
- replay gating — ⚠️ replay that live-fires side effects by default is a foot-gun cannon; dry-run default, live is a deliberate click
- graceful shutdown — 🔗 the checkpoint machinery makes clean deploys nearly free; failure-handling and deploy-handling converge again

## E — Debate
**"Adopt Temporal/Restate now that we understand the problem?"** We've re-derived checkpoints, resume, idempotency, replay — exactly their value proposition. Adopting: production-grade durability, less bespoke code. Staying: full control, zero new infra, and the learning is banked. **Resolution:** stay for the course (the ADR now reads as a knowledgeable Temporal evaluation, not an ignorant one); a real team with this understanding could adopt it in a sprint. Lesson: *the right time to consider a framework is right after you've built its core badly once — now you can read its docs as a peer.*

## F/G — Close
- Squash: `feat(sprint-07): durable runs — checkpoints, idempotency, replay (closes #…)`
- **Lab (break-it):** junior injects crashes at each pipeline phase (before/after vendor ack, before/after checkpoint) via a fault flag and confirms zero duplicates across all; then finds the one action where at-least-once is unavoidable and explains why.
- Ledger: S5 duplicate-email arc fully closed.
- Recap idea: *durable execution is one promise — crash anywhere, resume correctly — and idempotency keys are how that promise survives systems you don't own.*
