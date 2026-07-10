# ADR-0001: The engine is a dedicated worker app, not a route in the API

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S01
- **Deciders:** Relay authors

## Context
A relay run executes steps that call external vendors — work that is slow, bursty, retry-heavy, and
occasionally CPU-bound (sandboxed code steps arrive in S09). The API, by contrast, must stay fast and
predictable for the builder UI and inbound webhooks. These are two different workloads with two
different scaling curves and two different failure modes.

## Decision
Execution lives in its own app: **`apps/engine`**, a BullMQ worker fleet consuming a Redis queue. The
API's only job at trigger time is to record a Run (truth) and enqueue a job (work). The engine picks it
up and runs it. They share `packages/db` and `packages/shared` but are deployed and scaled separately.

## Alternatives considered
- **Execute inline in the webhook handler.** Simplest to write, and fine for a demo — but a slow or
  hung vendor now blocks an HTTP worker, a burst of triggers starves request serving, and you cannot
  scale execution independently of the API. The webhook must return in milliseconds; a run can take
  minutes. Coupling them makes both worse.
- **A single process that both serves and works (a background loop in the API).** Hides the boundary
  we most want the learner to see, and shares a failure domain: an OOM in a code step would take down
  request serving too.

## Consequences
- The API stays a thin, fast trigger/query surface; the engine owns the hard execution problems
  (retries, checkpoints, idempotency, sandboxing) that the next fourteen sprints are about.
- Two apps means an interface between them — the queue — which forces us to be explicit about what
  crosses it (a run *id*, not a run). That explicitness is the setup for ADR-0002.
- More deploy surface and local dev processes (`web`, `api`, `engine`). Worth it: the separation is the
  spine of everything that follows.
- **Revisit if** the operational overhead of a separate fleet ever outweighs the isolation — it won't
  at this product's shape, where execution is the core.

## Links
- ADR-0002 (run state in Postgres), `apps/engine/src/worker.ts`, `apps/api/src/queue.ts`,
  `docs/sprints/sprint-01.md`
