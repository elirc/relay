# ADR-0012: Payload offloading + array-op cost bounds

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S10
- **Deciders:** Relay authors

## Context
Real data is arrays and real vendor responses are sometimes multi-megabyte. Two operational realities hit
at once: (1) step outputs stored inline as JSONB (flaw #2, planted S05) bloat the OLTP runs table —
invisible until payloads got real; (2) user expressions over arrays are unbounded compute — a `map` over
a million-item collection is a self-inflicted DoS.

## Decision
- **Offload large outputs; keep the ref in Postgres.** Above a size threshold (default 64 KB), a step's
  output bytes go to **object storage** and only a small `outputRef` stays in the `StepRun` row. Postgres
  stays queryable and lean; the blob store holds the blob (databases are bad blob stores). **This
  harvests flaw #2** — the inline-JSONB shape ("blobs in the OLTP table") is replaced by ref-in-PG,
  bytes-in-object-storage.
- **Rehydrate lazily.** S07's "return stored output, don't re-execute" now spans storage: an offloaded
  output is fetched **only when an expression actually reads it**. Fetching every ref eagerly would just
  re-bloat memory — the exact problem we moved to storage to avoid.
- **Fan-out with per-item checkpoints + bounded concurrency.** Each iteration is a checkpointed node
  (S07), so a fan-out of 500 that crashes at 300 resumes at 301. Concurrency is capped (static for now;
  S11 makes it fair) — parallelism against someone else's API is a rate-limit incident in waiting.
- **Array ops are bounded.** Every array helper caps its input at `MAX_COLLECTION_SIZE`. Grammar growth
  is a **cost** review, not only a security review.

## Alternatives considered
- **Keep everything inline (do nothing).** Simplest, and fine until it isn't — the runs table degrades
  every query and backup as payloads grow. The flaw was invisible precisely because small demos never hit
  it; scale finds your storage shortcuts.
- **Offload everything (no threshold).** Every read becomes a network fetch, even for tiny outputs — slow
  and needlessly complex. The threshold keeps the common (small) case a plain column read.
- **Collect all fan-out results into memory** (the S10 debate): 5,000 large outputs = memory blowup. We
  collect **refs** (bounded) and rehydrate on demand; a downstream step that wants the whole set pays for
  it explicitly, with a documented ceiling. *"Give me all the results" is a memory contract — bound it or
  it bounds you.*

## Consequences
- Runs-table size drops sharply on heavy relays (the demo shows it); queries and backups get faster.
- A new failure mode: object storage must be available to rehydrate an offloaded output. Acceptable — the
  ref is durable in PG, and a missing blob is a clear, contained error.
- **Deferred:** nested fan-out (fan-out within fan-out), streaming aggregation nodes.

## Links
- `packages/shared/src/{offload,concurrency}.ts`, `packages/expr/src/array-ops.ts`,
  `apps/engine/src/fanout.ts` + worker offload wiring, ADR-0007 (checkpoints), `docs/sprints/sprint-10.md`
