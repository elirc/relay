# ADR-0009: Durable execution — checkpoints, idempotency keys, replay (the Temporal map, realized)

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S07
- **Deciders:** Relay authors

## Context
S05 shipped an engine that works and documented exactly how it can lie: a crash between a side effect
landing on a vendor and the checkpoint recording it duplicates that side effect. Resume-from-last-write
narrowed the window but couldn't close it — because *our* database and the *vendor's* database commit at
different instants, and "resume from our last write" has no way to know what happened in that gap.

## Decision
Rebuild the engine around three durable-execution primitives (ADR-0001's S01 note promised to re-derive
Temporal's model by hand; here it is):

1. **Checkpoints.** Each `StepRun` is a durable state machine (`pending → running → succeeded/failed`).
   A step runs only if it isn't already `succeeded`; a completed step **rehydrates its stored output**
   rather than re-executing. *Never take step N+1's word for step N.*
2. **Idempotency keys that travel with the side effect.** The engine derives a stable key per step from
   the connector's S03 strategy and sends it to the vendor (`vendorKey` → the vendor's header;
   `naturalKey` → a content-derived key the farm honors). The key is stable across every retry and
   resume, so the vendor — the system that actually performed the effect — recognizes a repeat and does
   not act twice. **This is what closes the ugly window:** even when our checkpoint is missing, the key
   already reached the arbiter of truth.
3. **Replay.** Re-run a historical run's trigger against the pinned or a chosen version. Deterministic
   (same input + version ⇒ same resolved inputs), and **side-effect-gated**: dry-run by default, live is
   a deliberate click.

Graceful shutdown falls out for free: SIGTERM lets the current step checkpoint, then the run resumes on
the next instance — deploys stop being incidents.

## Alternatives considered
- **Adopt Temporal / Restate now.** We have re-derived exactly their value — checkpoints, resume,
  idempotency, replay — so this ADR now reads as a *knowledgeable* evaluation rather than an ignorant
  one. For the course we stay hand-rolled (full control, no new infra, the learning banked); a real team
  with this understanding could adopt Temporal in a sprint. *The right time to consider a framework is
  right after you've built its core badly once — now you can read its docs as a peer.*
- **"Resume from our last write" alone (S05's partial fix).** Proven insufficient: it cannot survive the
  gap between the two databases. Only a key that travels with the side effect can.
- **Exactly-once for every action.** Impossible when the vendor offers no idempotency (ChatBox). The
  honest answer is `dedupeWindow` + an **at-least-once** warning surfaced in the builder — engineering
  honesty as UX.

## Consequences
- The S05 duplicate-email arc is **closed** (flaw ledger updated): the flagship test that duplicated in
  S05 now fires each side effect exactly once.
- Output must be persisted to rehydrate resumed steps — which is *why* outputs got big (flaw #2,
  harvested S10).
- Some actions remain at-least-once by nature; the product says so rather than pretending.

## Links
- `apps/engine/src/{executor,idempotency,durable.test}.ts`, `packages/vendor-farm/src/vendors/*`
  (Idempotency-Key), `apps/api/src/routes/relays.ts` (replay), ADR-0005 (idempotency strategies),
  ADR-0007 (retry), `docs/sprints/sprint-07.md`
