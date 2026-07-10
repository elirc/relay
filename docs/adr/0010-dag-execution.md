# ADR-0010: DAG execution — topological order, validation in two layers, structured conditions

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S08
- **Deciders:** Relay authors (learner-authored draft, reviewed)

## Context
Relays outgrew the line. Users need conditional paths ("if paid, email; else notify"), filters that halt
a branch, and multiple branches — a real DAG. A graph executor has two classic traps: running a **join
node once per incoming path** (diamonds) and **infinite loops** (cycles). And conditions raise the S04
question again: how much expression power to expose without opening an eval surface.

## Decision
- **Topological execution (Kahn's algorithm).** Process nodes in an order where each follows its
  predecessors; each node runs **exactly once** (fixing diamonds), and a node that never reaches
  in-degree 0 reveals a **cycle** as a natural side effect. The learner's first cut — recursive DFS with
  no visited set — is kept as the failing oracle (`dag-exec.test.ts`): it runs a diamond's join twice
  and loops on cycles. The rewrite makes both bugs impossible.
- **Checkpoints already solved joins.** The durable engine's "run only if not already SUCCEEDED" rule
  (S07) is *the* diamond fix — good foundations made this feature mostly fall out.
- **Validation in two layers.** Acyclic / single-source / reachable / upstream-only refs are checked at
  **publish** (fast feedback, 422 on a cycle submitted via raw API) *and* the executor's `topoOrder`
  guards at **run time** (defense in depth). A cycle can be rejected before it ever runs, and can't run
  even if it slips past the writer.
- **Structured conditions, one evaluator.** Conditions are a **structured rule builder** (field / op /
  value), authored as data, that compiles to a tiny boolean AST — not user-typed logic strings. So we
  add comparison and `and`/`or`/`not`, but as **data with no eval surface**, and each operator is a
  deliberate, logged addition (contrast S04's paths-only start).

## Alternatives considered
- **Conditions as a mini expression language (user-typed logic strings).** Powerful, but it's
  user-authored logic in *our* evaluator — an injection surface and a debuggability problem. The
  structured builder is safe and discoverable; compiling it to the AST keeps a single execution path
  underneath. *Give users structure, keep one execution path.*
- **Recursive DFS execution (the learner's version).** Intuitive, but wrong on diamonds and unbounded on
  cycles. Kept only as the teaching oracle.
- **Only run-time cycle guards (skip publish validation).** Correct but a bad experience — the user
  learns their graph is broken when a run hangs, not when they save. Validate at write.

## Consequences
- Filters halt a *branch* independently; a run's status reflects partial completion — this resolves
  S05's fail-fast debate (error/halt is now graph structure, not a global switch).
- The linear model (S04) is a straight-line DAG; `linearToDag` migrates existing relays.
- **Deferred:** parallel-branch concurrency (relates to S10 fan-out), explicit error-handler (try/catch)
  nodes, and the visual graph-editor canvas (the API accepts DAG definitions today).

## Links
- `packages/shared/src/dag.ts` (topoOrder, validateDag, linearToDag), `packages/expr/src/condition.ts`,
  `apps/engine/src/dag-exec.ts` (+ tests), `apps/api/src/routes/relays.ts` (validation), ADR-0007,
  `docs/sprints/sprint-08.md`
