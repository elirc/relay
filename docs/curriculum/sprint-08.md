# Curriculum Note — Sprint 8: Branching & the DAG (dialogue)

> **Dialogue format.** You authored the first graph executor (recursive DFS); this note reviews it and
> the rewrite. The point isn't that your version was "wrong" — it's the *specific* ways a natural first
> attempt breaks, and how the right data structure makes those bugs impossible.

## Learning objectives
- Execute a workflow **graph** correctly: topological order, join-once, cycle detection.
- See how **checkpoints (S07) already solved** the diamond problem — good foundations compound.
- Validate a graph in **two layers** (write-time + run-time) — defense in depth.
- Extend an expression language **safely**: structured conditions, one evaluator, no eval.

## Key concepts
- **Recursion over a graph without a visited-set is two bugs waiting.** Your DFS ran a diamond's join
  node once *per incoming path* (twice), and would recurse forever on a cycle. Both are the classic
  consequence of "visit children" with no memory of where you've been. Annotated in `dag-exec.test.ts`,
  which keeps your version as the failing oracle so the rewrite has something to be better *than*.
- **Kahn's topological sort, from first principles.** Track each node's in-degree; process the frontier
  of in-degree-0 nodes; decrement children as you go. A node is emitted exactly once (join fixed), and
  if some node never reaches in-degree 0, it's in a cycle (detected for free). Read `topoOrder`.
- **Checkpoints already solved joins.** The durable engine's "run a node only if it isn't already
  SUCCEEDED" rule (S07) is *literally* the diamond fix. When a later feature falls out of an earlier
  foundation, notice it — that's the compounding return on doing the hard sprint well.
- **Validate at write AND guard at execute.** A cycle submitted via the raw API is rejected at publish
  with 422 (fast feedback); and `topoOrder` throws at run time even if a bad graph slips through. Two
  layers, two jobs: the writer gets a clear error now, and the executor can never hang.
- **Grammar growth is a security decision.** We added comparison and `and`/`or`/`not` — but as a
  **structured AST authored through a rule builder**, not user-typed logic strings in our evaluator.
  Each operator is a logged, deliberate addition (ADR-0010). Contrast S04's paths-only start: there we
  refused operators to keep the injection surface a path resolver; here we add them as *data*, so there's
  still no eval. The debate's resolution — *give users structure, keep one execution path underneath* —
  is why conditions compile to the same tiny AST the engine evaluates.
- **Halting a branch ≠ failing a run.** A filter that evaluates false cuts its downstream branch cleanly;
  the run isn't "failed," it's partially completed. Different run status, different user meaning — the
  vocabulary matters in run history. This resolves S05's fail-fast debate: error/halt is now graph
  structure, not one global switch.

## Exercise questions
1. Before reading the rewrite, predict exactly where your DFS breaks on the diamond `A→{B,C}→D`. How many
   times does D run, and why? Now do the same for a cycle.
2. Explain how Kahn's algorithm detects a cycle *without a separate check*. What is the leftover-count
   invariant?
3. Cycle validation lives at publish and at execute. Give an attack/mistake each layer catches that the
   other doesn't.
4. Why compile the structured rule builder to the expression AST instead of evaluating rules directly?
   What does "one execution path underneath" buy you in testing and security?

## Deferred (linked issues)
Parallel-branch concurrency (S10 fan-out relates) · error-handler (try/catch) nodes · the visual
graph-editor canvas (the API accepts DAG definitions today).

## Further reading
- Topological sort (Kahn / DFS) · DAG scheduling (Airflow, Argo) · Structured vs. free-form rule engines
  · Visited-sets and cycle detection · Compiling a rule builder to a safe AST
