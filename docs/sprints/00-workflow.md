# Relay — Sprint Execution Workflow

Same ritual as prior courses; restated so this folder is self-contained when split into its own repo.

## Roles
- **Author (AI):** all code, commits, PR bodies, teaching comments, debate threads.
- **Learner (junior):** predict-before-reading, review-before-reveal, prescribed reading order, labs. Co-authors the junior side of S8, runs the S13 audit, and **ships a connector solo in S14** against the certification harness.

## Lifecycle (Phases A–G)
- **A — Setup:** milestone, 3–6 issues, branch `sprint-NN/<slug>`.
- **B — Build:** ordered conventional commits. `[flaw]` logged in `flaw-ledger.md`; `[fix-later-in-PR]` = broken → failing test → fix as a visible story.
- **C — Draft PR:** template body incl. **How to review** order. CI green unless scripted.
- **D — Teaching comments:** 8–20 inline, after the learner's review pass. Prefixes: `📘 concept` · `🔍 review-lens` · `⚠️ pitfall` · `🔗 connects`.
- **E — Planted debate:** question → options → resolution (+ ADR/commit as called for).
- **F — Finalize:** curriculum note with exercises; squash-merge `feat(sprint-NN): … (closes #…)`.
- **G — Post-merge:** deploy check (S5+), deferred issues, milestone close, Sprint Recap, lab branch if scheduled, tags at S5/S15.

## Relay-specific rules
1. **Idempotency declarations:** every connector action declares its side-effect idempotency strategy (`naturalKey` | `vendorIdempotencyKey` | `dedupeWindow`) in its definition. A PR adding an action without one does not merge.
2. **Chaos always on:** integration tests run with the vendor farm's failure injection enabled (latency spikes + occasional 429/500). Deterministic seeds keep CI stable.
3. **No eval, ever:** the expression language and code steps are the only places user input becomes behavior; both are allowlisted, sandboxed, and fuzzed. Any `eval`/`new Function` outside the sandbox fails lint.
4. **Labs:** after S4, S7, S9, S11, S13 — including sandbox-escape attempts (S9) and a poison-pill hunt (S13).
5. Conventions otherwise identical: squash-only linear `main`, Conventional Commits, no red merges, TODOs need issues, flaw harvests quote the ledger.
