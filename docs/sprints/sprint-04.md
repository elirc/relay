# Sprint 04 — Builder v1: Linear Relays + Safe Expressions

**Branch:** `sprint-04/builder-expressions` · **Size:** L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** The builder UI for linear relays (trigger → action → action), forms generated from connector schemas, field mapping with a hand-rolled safe expression language (`{{steps.1.output.email}}`), and test-run mode with sample data. No eval, ever.

## A — Issues
1. `packages/expr: tokenizer, path resolver, renderer — no eval`
2. `Relay model: versioned definitions (immutable graph, linear for now)`
3. `Builder UI: step list, connector picker, schema-generated forms, mapping picker`
4. `Test-run mode: fetch sample trigger data, dry-run steps against vendor sandboxes`

## B — Commits
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(expr): tokenizer + path grammar — {{steps.N.output.path}}, {{trigger.field}}` | grammar is a closed spec: paths only, no operators, no function calls — v1 smallness is a security feature |
| 2 | `feat(expr): resolver + renderer — template string → resolved value; type preservation for whole-field refs` | `{{x}}` alone keeps the value's type; mixed text coerces to string — subtle, documented, tested. **[flaw #1]** render is naive interpolation: resolved output containing `{{…}}` re-expands (harvest S13) |
| 3 | `test(expr): grammar cases, missing-path behavior (render-time error vs empty), type preservation` | |
| 4 | `feat(db): Relay versions — definition JSON immutable per version; draft vs published` | editing creates drafts; runs pin the version they started on — the immutability decision that makes S7 replay possible |
| 5 | `feat(web): builder — step list, connector/action picker from registry, zod-schema-generated forms` | the S3 schemas pay off: no per-connector UI code |
| 6 | `feat(web): mapping picker — insert {{…}} refs from upstream step outputs (typed tree browser)` | upstream-only enforcement: step 3 can reference 1–2, never 4 — order matters even before DAGs |
| 7 | `feat(api+web): test-run — pull sample trigger data from vendor, execute steps in dry-run (vendor sandbox mode)` | the farm's sandbox flag: actions execute but flagged ephemeral; what "test" means per action documented in defs |
| 8 | `test(e2e): build MailPost→SheetLite relay in the UI, test-run, publish` | |
| 9 | `docs: ADR-0006 expression language design; curriculum note` | |

## C — Review order
The grammar spec (1) → type preservation (2) → version immutability (4) → schema-generated forms (5).

## D — Teaching comments (~10)
- closed grammar — 📘 the safest language is the one that can't do anything: paths-only v1 means the injection surface is a path resolver; every operator added later (S10) is a security decision, made one at a time
- no eval lint rule — 🔍 review-lens: the rule from 00-workflow enforced in CI from this commit; the alternative history (`new Function` templating) sketched in the ADR with its CVE-shaped consequences
- type preservation — ⚠️ `{{row.count}}` as number vs `"Count: {{row.count}}"` as string; automation platforms that coerce everything to strings corrupt data silently — this distinction is product quality
- version immutability — 📘 a run must be explicable forever: "what did the relay look like when this ran?" requires versions runs can pin; mutable definitions make debugging archaeology
- schema-generated forms — 🔗 S3's triple-duty schemas: the 10th connector gets a UI for free; where generated forms break (dependent fields) and the escape hatch
- upstream-only refs — 📘 reference validity is a graph property; enforcing it in the picker *and* the API (defense in both layers)
- renderer — *(silent on re-expansion — flaw #1 planted; S13's fuzzer earns its keep)*

## E — Debate
**"Sample data for test-runs: fetch real vendor data vs synthetic from schemas?"** Synthetic: safe, instant, but users don't trust green checks on fake data. Real: trust, but slow and side-effect-adjacent. **Resolution:** real trigger samples (reads are safe) + sandboxed action execution; synthetic as fallback when the connection is unhealthy. Lesson: *test-mode design is trust design — users forgive slow, not fake.*

## F/G — Close
- Squash: `feat(sprint-04): builder v1, expression language, test-run (closes #…)`
- **Lab:** `lab/sprint-04` — three bugs: a mapping picker offering downstream refs, a type-coercion bug flattening arrays, a missing-path silent-empty case that should error.
- Ledger: flaw #1 recorded.
- Recap idea: *the expression language is the product's most-attacked API — we made it tiny on purpose.*
