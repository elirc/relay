# ADR-0002: Run state lives in Postgres (truth); Redis holds only work

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S01
- **Deciders:** Relay authors

## Context
The engine needs a queue (BullMQ on Redis) to hand work between the API and the workers. It's tempting
to let the queue also *be* the run — the job payload carries everything, the worker mutates it, done.
But a run is not a transient task: it's a **business record**. Users open it days later to ask "why did
my Tuesday sync fail?"; support audits it; billing meters it (S12). Ask the load-bearing question:
**if Redis were flushed right now, what must survive?**

## Decision
**Postgres is the source of truth for run state** — `Run`, `StepRun`, and the append-only `RunEvent`
log all live in PG. **Redis holds only work**: a job whose payload is a run *id*, a pointer that says
"go execute run X." The Run row exists *before* the job is enqueued (see the ordering in
`apps/api/src/routes/hooks.ts`). A lost job leaves a recoverable `pending` run; a lost queue never
loses history.

## Alternatives considered
- **Run state in Redis (the job is the run).** Fast, one system, no join between "the queue" and "the
  record." But Redis is a conveyor, not a filing cabinet: it's memory-first, eviction-prone, and its
  durability guarantees are not what you want backing an auditable business record. A flush or eviction
  would erase run history — unacceptable.
- **Event-source runs into a log-only store (e.g. Kafka), project to PG.** Powerful and closer to where
  a huge system lands — but it front-loads enormous machinery to learn the basics. We start with PG as
  truth and let the `RunEvent` log teach the event-sourcing instinct at a size we can hold in our head.

## Consequences
- Every execution mutation is a PG write, and the write **ordering** matters: truth first (create the
  Run), then work (enqueue). This ordering is a recurring correctness lens across the course.
- The naive S01 engine still persists run results *at the end* of execution, not incrementally — a real
  gap (a crash mid-run strands the run and can double-fire side effects). ADR-0002 says *where* truth
  lives; making that truth **durable step-by-step** is S07's durable-engine work. Read `worker.ts`'s
  ⚠️ comment for the exact hole.
- **Revisit if** run volume outgrows a single Postgres (partition `RunEvent` by time, or offload step
  outputs to object storage — the latter is already on the ledger for S10).

## Links
- ADR-0001 (dedicated engine app), `packages/db/prisma/schema.prisma`, `apps/api/src/queue.ts`,
  `apps/engine/src/worker.ts`, `docs/sprints/sprint-01.md`
