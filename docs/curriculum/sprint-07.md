# Curriculum Note — Sprint 7: Durable Runs (the flagship)

## Learning objectives
- Build **durable execution** by hand: checkpoints, resume, idempotency enforcement, replay.
- Internalize the course's deepest lesson: **two databases commit at different instants**, and only a
  key that travels with the side effect survives the gap.
- Understand when exactly-once is impossible, and why saying so is a product feature.
- See how durability makes **clean deploys nearly free**.

## Key concepts
- **Checkpoint before advancing — never take step N+1's word for step N.** Each StepRun is a durable
  state machine; a step runs only if it isn't already `succeeded`, and a completed step **rehydrates its
  stored output** instead of re-executing. The checkpoint is a promise you can crash against.
- **The flagship, and the diff that is the whole sprint.** `durable.test.ts` runs the *identical* crash
  scenario as S05's `executor.test.ts`. In S05 the side effect fired twice; here it fires once. Read the
  two tests side by side — the difference between their outputs is exactly what this sprint bought.
- **The ugly window, and why resume alone can't close it.** A crash *between* the vendor's ack and our
  checkpoint leaves us not knowing whether the effect happened. "Resume from our last write" (S05's
  partial fix) has no information about that gap. The only thing that survives it is an **idempotency
  key that traveled with the side effect** to the vendor — the system that actually did the work and
  can recognize a repeat. Our DB and their DB commit at different instants; the key is the bridge.
- **The S3 declaration becomes mechanism.** `vendorKey` → the vendor dedupes on the key we send;
  `naturalKey` → a content-derived key (the farm honors it) so even a different run can't double-apply;
  `dedupeWindow` → engine-side seen-set, and honestly **at-least-once**. The promise made in Sprint 3 is
  now enforced at runtime.
- **At-least-once honesty as UX.** When the vendor offers no idempotency (ChatBox), exactly-once is
  impossible, so the builder *tells the user* "this action may run twice." Engineering honesty surfaced
  in the product beats a false guarantee.
- **Replay is checkpoint-resume with a fresh run id — and it's gated.** Dry-run (default) re-resolves the
  plan with no side effects; live is a deliberate click. Replay that live-fires by default is a foot-gun
  cannon.
- **Graceful shutdown for free.** Because every step checkpoints, SIGTERM lets the current step commit
  and the run resumes on the next instance. Deploys stop being incidents — failure-handling and
  deploy-handling converge (a law other courses meet at S15; the engine demands it early).

## Ledger
- **Flaw #2** persists (large inline outputs) — harvested S10; note it's the *reason* rehydration works.
- **The S05 duplicate-email arc is CLOSED.** The flagship test is permanently green.

## Exercise questions
1. Draw the timeline of the "ugly window." Mark the vendor's commit and our checkpoint's commit. Explain
   precisely why resume-from-our-last-write can't decide correctly, and what the idempotency key adds.
2. For each strategy (vendorKey, naturalKey, dedupeWindow), state exactly what closes the window — and
   for the one that can't, what the user is told and why that's the right move.
3. Why must the idempotency key be stable across resumes but the *attempt counter* increment? What would
   break if the key changed per attempt?
4. Replay defaults to dry-run. Construct the incident that a live-by-default replay button would cause.

## Lab (`lab/sprint-07`, break-it)
Inject crashes at each pipeline phase (before/after vendor ack, before/after checkpoint) via a fault
flag; confirm zero duplicates across all. Then find the one action where at-least-once is unavoidable
and explain why.

## Debate
**Adopt Temporal/Restate now?** Resolved: stay hand-rolled for the course; the ADR now reads as a
knowledgeable evaluation. *The right time to consider a framework is right after you've built its core
badly once — now you can read its docs as a peer.*

## Further reading
- Temporal / durable execution · Idempotency keys (Stripe) · Two-phase commit & the dual-write problem ·
  Exactly-once vs effectively-once · Saga pattern
