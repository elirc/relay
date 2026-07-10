# Curriculum Note — Sprint 1: Foundation (the hardcoded two-step relay)

## Learning objectives
- See the **whole shape** of a workflow engine in embryo: trigger → run → step → event log.
- Internalize the **truth vs. work** split (Postgres holds runs; Redis holds jobs) and why write
  *ordering* follows from it.
- Learn to read a naive implementation as a **"before" photo** — to enumerate what's missing and
  recognize that list as the course syllabus.
- Understand why an automation product ships its **observability surface (run history) first**.

## Key concepts
- **The RunEvent log is the product.** In an automation tool, users don't debug your engine — they
  debug *their* workflow, using *your* execution events. So the append-only log exists from day one,
  before retries, before checkpoints. (Same instinct as an append-only mutation log in a sync engine —
  🔗 Tracer S06, applied to execution.) The `@@unique([runId, seq])` constraint makes the log
  tamper-evident: you can't silently reorder history.
- **Truth vs. work.** The queue is a conveyor, not a filing cabinet. A run is a business record
  (queryable, durable, auditable) and lives in Postgres; the BullMQ job is just a pointer ("execute run
  X") and lives in Redis. The test of the boundary: *if Redis were flushed, what must survive?* (ADR-0002)
- **Ordering falls out of the split.** The webhook creates the Run (truth) *then* enqueues the job
  (work). Reverse it and a job could reference a run that was never saved. Correctness lives in the order.
- **Two apps, one interface.** Execution is a different workload from request serving, so the engine is
  its own app (ADR-0001). The only thing crossing the boundary is a run id — that forced explicitness is
  what makes the system legible.
- **The naive engine, read as a syllabus.** `engine-core.ts` runs steps linearly and fails fast, with
  **no retries, no timeout, no checkpoint, no idempotency, no branching**. Each omission is a future
  sprint. The `worker.ts` ⚠️ comment marks the sharpest one: results are persisted only at the *end*, so
  a crash mid-run strands the run and could double-fire a real side effect — the exact scenario S05's
  in-PR arc triggers and S07's durable engine fixes.

## Why the pure core matters
`runRelay` is a **pure function** of its inputs and injected dependencies (an HTTP client + a clock).
That's why the walking-skeleton integration test runs with zero infrastructure — no Redis, no Postgres,
no network — using a fake vendor. The BullMQ worker and Prisma writes are a thin shell around it. Keep
the logic pure and the I/O at the edges, and your hardest code becomes your most testable code.

## Exercise questions
1. The webhook returns `202 Accepted`, not `200`. Why is that the honest status code here?
2. List every reason the naive engine could lose or corrupt a run. For each, name the sprint that fixes
   it (peek at `SPEC.md` §6 only after you've tried).
3. If Redis is flushed while three runs are `pending`, what happens to them? What component (not yet
   built) would recover them, and which sprint adds it?
4. The `RunEvent` table has `@@unique([runId, seq])`. What class of bug does that constraint prevent,
   and how does it relate to Tracer's mutation-log ordering?

## Further reading
- Durable execution & the workflow-engine landscape (Temporal, AWS Step Functions) — and why we
  hand-roll first (see the S01 debate) · Queues vs. databases (work vs. truth) · Append-only logs
