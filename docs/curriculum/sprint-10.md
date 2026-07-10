# Curriculum Note — Sprint 10: Data Mapping v2 (arrays, loops, large payloads)

## Learning objectives
- Fan out over arrays and see the **S07 durability dividend** pay off at scale.
- Harvest flaw #2: **databases are bad blob stores** — offload large payloads, keep the ref.
- Rehydrate **lazily**, and bound array operations by **cost**, not just by safety.

## Key concepts
- **Fan-out durability is nearly free — because of S07.** Each iteration is just a checkpointed node, so a
  fan-out of 500 that crashes at 300 resumes at 301; completed items rehydrate and never re-fire. Now
  imagine this *without* checkpoints: you can't resume, so you re-send 300 emails. A hard feature became a
  small one purely because an earlier sprint was done well. Notice when foundations compound.
- **Scale finds your storage shortcuts (flaw #2).** Step outputs were stored inline as JSONB (planted
  S05). Small demos never hit it; then a multi-MB vendor response inlined into a row bloats the OLTP runs
  table and drags every query and backup. The fix: above a threshold, the *bytes* go to object storage
  and only a small **ref** stays in Postgres. Databases are for queryable records; blob stores are for
  blobs. Keep the ref where you query, put the bytes where they're cheap.
- **Rehydrate lazily.** S07's "return the stored output, don't re-execute" now spans storage — but fetch
  an offloaded output only when an expression actually touches it. Eagerly loading every ref just
  re-bloats the memory you moved to storage to protect. Laziness is the point, not an optimization.
- **Array ops are unbounded compute until you bound them.** A user `map`/`filter` over a million-item
  array is a denial-of-service on yourself. Every array helper caps its input at `MAX_COLLECTION_SIZE`.
  Growing the expression grammar is a **cost** review as much as a security review — new power, new
  attack surface, new compute budget.
- **Fan-out concurrency is a rate-limit incident in waiting.** 5,000 parallel calls will get you
  throttled or banned by the vendor. A static concurrency cap is the placeholder here; S11 replaces it
  with real per-vendor fairness.

## The debate, cashed
**Collect all fan-out results into memory vs. stream/aggregate.** Resolved: collect **refs** (bounded),
rehydrate on demand; a step that wants the whole set pays explicitly with a documented ceiling. *"Give me
all the results" is a memory contract — bound it or it bounds you.*

## Ledger
- **Flaw #2 CLOSED.** Inline JSONB blobs → ref-in-Postgres + bytes-in-object-storage above a threshold.

## Exercise questions
1. A fan-out of 1,000 emails crashes at item 700. With per-item checkpoints, how many emails send on
   resume? Without S07's checkpoints? Explain the mechanism.
2. Why keep the *ref* in Postgres but the *bytes* in object storage, instead of putting both in one place?
   Give a query that benefits and one that now costs an extra fetch.
3. Why lazy rehydration? Construct the memory blowup that eager rehydration would cause on a heavy relay.
4. Where's the cost bound on array ops, and what specific expression would DoS the engine without it?

## Deferred
Nested fan-out (fan-out within fan-out) · streaming aggregation nodes · the fan-out sub-run history UI
(virtualized — the rendering answer is known).

## Further reading
- Blob storage vs. OLTP (the "don't store files in your database" rule) · Bounded concurrency / worker
  pools · Lazy loading & the N+1 trap · Cost-based limits on user-supplied compute
