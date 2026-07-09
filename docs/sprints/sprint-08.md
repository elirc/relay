# Sprint 08 — Branching & the DAG (Dialogue Format)

**Branch:** `sprint-08/dag-branching` · **Size:** L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** Relays graduate from lines to graphs: conditional paths, filters (halt a run), and multiple branches — a real DAG with validation and topological execution. Dialogue format: **the learner authors the junior graph model and executor**; the AI reviews and rebuilds.

## A — Issues
1. `DAG model: nodes + edges, replacing the linear step array`
2. `Filter/condition nodes: boolean expressions (expr language extended) gate downstream paths`
3. `DAG validation: acyclic, single-source, reachable, upstream-only refs`
4. `Topological execution integrated with S7 checkpoints`

## B — Commits (J = learner, S = AI review)
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(db): DAG definition — nodes[], edges[]; migration from linear (each old relay = a path)` | data migration of existing relays (🔗 the expand/backfill instinct, small-scale) |
| 2 | `feat(engine): DAG executor — [J] recursive depth-first from source` | works on simple graphs; breaks on diamonds (a join node runs twice) and has no cycle guard (infinite loop risk) |
| 3 | `refactor(engine): DAG executor — [S] Kahn topological order + join-node once-only + per-node checkpoints` | body reviews J: diamonds, cycles, and how checkpoints (S7) already had the answer for "run each node once"; **[in-PR arc]** commit 4 is the cycle bug's test |
| 4 | `test(engine): [J's executor] on a diamond → join runs twice; on a cycle → hangs; both FAIL` | J's code kept as the failing oracle — shows *why* the S rewrite exists |
| 5 | `feat(api): DAG validation — acyclic (the cycle bug, prevented at write), single source, reachability, upstream-only refs` | validation at publish; **[in-PR arc]** a cycle submitted via raw API → 422 test |
| 6 | `feat(expr): boolean conditions — comparisons, and/or/not (grammar extended deliberately, one operator set)` | each new operator is a security review line-item (🔗 S4's "tiny on purpose") |
| 7 | `feat(web): graph editor — nodes, edges, condition config, path visualization` | |
| 8 | `feat(engine): filter nodes halt their branch; run status reflects partial completion` | resolves S5's fail-fast debate: branches fail/halt independently now |
| 9 | `test(e2e): branching relay — condition routes to path A vs B; filter halts cleanly` | |
| 10 | `docs: ADR-0010 DAG execution; curriculum note (learner retro)` | |

## C — Review order
J's executor (2) — *predict the diamond bug before reading* → S's topological rewrite (3) → validation (5) → condition grammar (6).

## D — Teaching comments (~10)
- J's DFS — 🔍 review-lens: recursion over a graph without a visited-set is two bugs waiting (revisits + cycles); the classic; annotate where each strikes
- Kahn's algorithm — 📘 topological sort from first principles: in-degree tracking, the frontier queue; why it naturally runs each node once and detects cycles as a side effect
- checkpoints already solved joins — 🔗 the S7 "run only if not SUCCEEDED" rule *is* the diamond fix; good foundations make later features fall out — point this out explicitly
- cycle prevention in two layers — 📘 validate at write (fast feedback) *and* guard at execute (defense in depth); the API test proves the write-layer isn't the only guard
- grammar growth as security — ⚠️ every operator added to the expression language widens the attack surface; the ADR logs each with its risk — contrast S4's paths-only start
- filter semantics — 📘 halting a branch vs failing a run: different run statuses, different user meaning; the vocabulary matters in run history

## E — Debate
**"Conditions as a mini expression language vs a structured rule builder (field/op/value rows)?"** Expression: powerful, but user-authored logic strings in *our* evaluator (injection surface, debuggability). Structured: safe, discoverable, limited. **Resolution:** structured rule builder that *compiles to* the (already-safe) expression AST — best of both, and the compile step means one evaluator. Lesson: *give users structure, keep one execution path underneath.*

## F/G — Close
- Squash: `feat(sprint-08): dag branching, conditions, filters (closes #…)`
- Deferred: parallel-branch concurrency (S10 fan-out relates), error-handler paths (try/catch nodes).
- Recap idea: *a workflow engine is a graph executor with a memory — topological order plus checkpoints, and the hard cases dissolve.*
