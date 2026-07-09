# Sprint 10 — Data Mapping v2: Arrays, Loops & Large Payloads

**Branch:** `sprint-10/loops-payloads` · **Size:** M/L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** Real data is arrays: fan-out (run downstream steps per item), array expressions, and the operational reality of large vendor payloads — which forces payload offloading (harvesting the inline-JSONB flaw) and a hard look at run cost.

## A — Issues
1. `Fan-out step: iterate an array, execute a sub-path per item, collect results`
2. `Expression language v3: array access, map/filter-lite, aggregation helpers`
3. `Large payload handling: offload step outputs to object storage above a threshold`
4. `Fan-out concurrency + limits (don't melt a vendor with 5,000 parallel calls)`

## B — Commits
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(engine): fan-out node — for-each over array, sub-path per item, bounded concurrency` | each iteration checkpointed (S7): a fan-out of 500 that crashes at 300 resumes at 301 — the durability dividend at scale |
| 2 | `feat(engine): fan-out concurrency control — per-node limit + per-connection budget (pre-S11)` | 🔗 vendor rate limits (S11) will govern this; here it's a static cap with a pointer |
| 3 | `feat(db): output offloading — StepRun.outputRef → object storage when serialized size > threshold` | **harvests flaw #2**, ledger quoted; runs table size before/after on a heavy demo; the inline JSONB bloat is shown in a table-size graph |
| 4 | `feat(engine): transparent output rehydration — expressions resolving offloaded refs fetch lazily` | 🔗 S7's rehydrate-not-re-execute now spans storage; the expression resolver hides the fetch |
| 5 | `feat(expr): array ops — index, slice, map to a template, filter by condition, len/sum/join` | grammar grows again — each op reviewed for injection + cost (a map over 1M items is a DoS; bounded) |
| 6 | `test(expr): array ops + offloaded-ref resolution + cost bounds (max collection size)` | |
| 7 | `feat(web): fan-out UI — array picker, sub-path editor, per-item result inspection in history` | run history handles N sub-runs without melting the browser (virtualized — 🔗 Tracer S12 lesson) |
| 8 | `test(engine): fan-out resume mid-iteration; concurrency cap honored under farm chaos` | |
| 9 | `docs: ADR-0012 payload offloading threshold + array-op cost bounds; curriculum note` | |

## C — Review order
Fan-out checkpointing (1) → offloading (3) with the table-size evidence → transparent rehydration (4) → array-op cost bounds (5).

## D — Teaching comments (~9)
- per-item checkpoints — 🔗 S7 pays off hugely: fan-out durability is nearly free because each iteration is just a checkpointed node; imagine this without S7 (you can't resume — you re-send 300 emails)
- offload threshold — 📘 databases are bad blob stores; the size threshold decision, and why the *ref* stays in PG (queryable) while the *bytes* go to object storage — 🔗 flaw #2's shape was "blobs in the OLTP table"
- lazy rehydration — ⚠️ fetching every offloaded output eagerly re-bloats memory; resolve refs only when an expression touches them
- array-op cost bounds — ⚠️ user expressions over arrays are unbounded compute; `map` over an un-capped collection is a DoS on yourself; max-collection-size as a guard (🔗 Pulse's cardinality guards, expression-shaped)
- fan-out concurrency — 📘 parallelism against someone else's API is a rate-limit incident in waiting; the static cap here is a placeholder for S11's real fairness
- sub-run history virtualization — 🔗 reuse Tracer's windowing instinct; 5,000 sub-results is a rendering problem with a known answer

## E — Debate
**"Fan-out results: collect all into memory vs stream/aggregate incrementally?"** Collect: simple, but 5,000 large outputs = memory blowup. Stream: bounded memory, but downstream steps can't see "all results" as one array. **Resolution:** collect *refs* (bounded), rehydrate on demand; a downstream step wanting the whole set pays for it explicitly with a documented ceiling. Lesson: *"give me all the results" is a memory contract — bound it or it bounds you.*

## F/G — Close
- Squash: `feat(sprint-10): fan-out, array expressions, payload offloading (closes #…)`
- Deferred: nested fan-out (fan-out within fan-out), streaming aggregation nodes.
- Ledger: flaw #2 closed.
- Recap idea: *scale finds your storage shortcuts — blobs in the runs table were invisible until payloads got real.*
