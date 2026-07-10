# Curriculum Note — Sprint 5: Engine v1 + run history → v0.5.0

## Learning objectives
- Assemble the MVP engine: **render → validate → execute → persist**, and see why the order matters.
- Turn the S3 error taxonomy into a **legible retry policy** — a table, not vendor spaghetti.
- Confront the automation platform's **original sin**: a crash between a side effect and its record.
- Practice **honest partial fixes** — shrinking a window is not closing it, and the PR must say so.

## Key concepts
- **The step pipeline order is load-bearing.** Render first (expressions produce the real input),
  validate the rendered input (zod), execute (the side effect), persist last (you can only record an
  output you have). Each choice is defensible — and the gap between "execute" and "persist" is exactly
  where the trouble lives.
- **Retry is a table keyed on error class.** `RateLimited` honors `Retry-After`; `VendorDown` backs off;
  `AuthFailed`/`BadInput` never retry. Because S3 normalized every vendor failure into five kinds, this
  policy is ~10 lines and identical across all vendors. Retrying `BadInput` is spam; retrying
  `RateLimited` without honoring `Retry-After` is aggression that earns a longer ban. The taxonomy makes
  the policy *legible*. (🔗 client-side and server-side retry are cousins — same discipline.)
- **The duplicate-side-effect arc (the reason S07 exists).** A step sends a real email, then the process
  dies *before* the StepRun is persisted. On restart, the engine can't tell the email was sent — *your*
  database cannot tell you what *their* system received — so it sends it again. `executor.test.ts`
  documents this against the rig's "inbox." This single test justifies the entire durable-engine sprint.
- **An honest partial fix.** Resume-from-last-persisted means a restart skips steps it already finished,
  so a crash in step 2 no longer re-sends step 1's email. But the *in-flight* step still duplicates — the
  window is **narrowed, not closed**. The commit body says exactly what it fixes and what it doesn't.
  Watch, in your own reviews, for "fixed" claims that are really narrowings.
- **Secret redaction in history.** Run payloads are the user's debugging surface, and connection tokens
  ride in the contexts steps touch. Before persisting an output we mask any token in it
  (`redactSecrets`), so history is safe to show. A token rendered in a run view is a token leaked.

## Planted debt (find it before S10/S07)
- **Flaw #2:** step outputs are stored inline as JSONB on StepRun rows. Fine for small outputs; a
  multi-MB vendor response bloats the runs table. Harvested S10 (offload to object storage).
- **The crash window** itself is the setup for S07's flagship — not a flaw to fix now, but a documented
  liability.

## Exercise questions
1. Why validate *after* rendering rather than before? What could an unvalidated pre-render config hide?
2. Walk the two-step relay (email, then chat) through a crash on the chat step's persist. What does a
   naive restart do? What does resume-from-last-persisted do? What still duplicates, and why?
3. Give a concrete failure for each taxonomy class and say whether the engine retries it — then explain
   why retrying the non-retryable ones is actively harmful, not just wasteful.
4. A connection token appears in a step's output. Trace how it's prevented from reaching the history UI.

## Release
Post-merge: deploy → demo (run → history) → tag **`v0.5.0`** (MVP). The engine works; we documented
exactly how it can lie. **S07 is the reckoning.**

## Further reading
- Idempotency & exactly-once side effects · Retry/backoff & the thundering herd · Durable execution
  (Temporal activities, the problem we're re-deriving) · At-least-once vs exactly-once delivery
