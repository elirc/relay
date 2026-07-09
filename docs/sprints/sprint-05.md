# Sprint 05 — Engine v1, Run History → v0.5.0

**Branch:** `sprint-05/engine-v1` · **Size:** M/L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** Ship the MVP: published relays execute for real through a queued engine with basic per-step retries, run history gets step-level logs and payload inspection — and the sprint ends with a **deliberately painful in-PR arc**: an engine crash that sends a duplicate email, fixed only partially. The full fix is S7, and the PR says so honestly.

## A — Issues
1. `Engine v1: execute published relays — sequential steps, expression rendering, StepRun persistence`
2. `Per-step retry policy from the error taxonomy (RateLimited → backoff; BadInput → fail fast)`
3. `Run history v2: step logs, input/output inspection, error display`
4. `Deploy + E2E + demo relay; v0.5.0`

## B — Commits
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(engine): run executor — load pinned version, render inputs, execute steps sequentially` | each step: render → validate (zod) → execute → persist output — **[flaw #2]** outputs inline JSONB (harvest S10) |
| 2 | `feat(engine): retry policy per error class — RateLimited honors Retry-After, VendorDown backs off, BadInput fails fast` | the S3 taxonomy pays off: policy is a 10-line table, not vendor-specific spaghetti |
| 3 | `feat(engine): step timeout + run-level status rollup` | |
| 4 | `feat(web): run history v2 — step timeline, rendered inputs, outputs, error class + attempts` | payload inspection with secret redaction (connection tokens never render) |
| 5 | `test(engine): crash mid-run after send-email, before persist → restart → step re-executes → SECOND EMAIL SENT` | the arc: test *documents* the duplicate side effect against the vendor farm's inbox; commit body: "this is the automation platform's original sin" |
| 6 | `fix(engine): resume-from-last-persisted-step on restart — [partial fix]` | honest scope: crash *between* execute and persist still duplicates; the window is narrowed, not closed; body links the S7 issue and explains why the real fix (checkpoint + idempotency enforcement) is a sprint, not a commit |
| 7 | `feat(db): demo seed — two demo relays wired to the farm` | |
| 8 | `test(e2e): publish → trigger via webhook → run succeeds → history shows steps` | |
| 9 | `ci+deploy: dockerfiles, deploy, health (fast-forward)` | |
| 10 | `docs: ADR-0007 retry policy by error class; curriculum note` | |

## C — Review order
Executor (1) → retry table (2) → **the duplicate-email arc (5→6) — read the test output transcript** → the honest partial-fix commit body.

## D — Teaching comments (~9)
- render→validate→execute→persist — 📘 the step pipeline's order matters: validation after render (expressions produce the real input), persistence after execution (…and there's the window — see commit 5)
- retry-by-class — 📘 retrying BadInput is spam; retrying RateLimited without honoring Retry-After is aggression; the taxonomy makes policy legible — 🔗 compare Pulse's SDK retry lessons: client-side and server-side retry are cousins
- duplicate email — ⚠️ the crash window: side effect landed, record didn't; *your* database can't tell you what *their* system received; this single test justifies S7's existence
- partial fix honesty — 🔍 review-lens: commit 6's body scopes exactly what it fixes and what it doesn't — shrinking a window ≠ closing it; watch for "fixed" claims that are narrowings
- secret redaction in history — ⚠️ run payloads are user-debuggable, tokens ride in contexts; the redaction test (a token string planted in a payload must render masked)
- deferred properly — 🔗 the S7 issue created *now*, linked from code comments at the exact window — TODOs with teeth

## E — Debate
**"Fail the whole run on step failure vs continue-with-error?"** Fail-fast: predictable, but one flaky step kills a 5-step relay. Continue: partial effects confuse. **Resolution:** fail-fast in v1 (simplest honest behavior); error-handling *paths* are S8's DAG material — the debate resolution is really a roadmap pointer. Lesson: *v1 semantics should be the ones you can explain in one sentence.*

## F/G — Close
- Squash: `feat(sprint-05): engine v1, run history, deploy (closes #…)`
- **Post-merge:** deploy → demo (webhook → run → inbox) → tag **`v0.5.0`** → MVP retro.
- Ledger: flaw #2 recorded.
- Recap idea: *we shipped an engine that works and documented exactly how it can lie — S7 is the reckoning.*
