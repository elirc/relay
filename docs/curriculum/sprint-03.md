# Curriculum Note — Sprint 3: Connector SDK + first two connectors

## Learning objectives
- Design a **declarative plugin SDK** — definitions as data, not code — and see what that buys you.
- Make the **Nth integration cheap** by absorbing vendor inconsistency into one abstraction.
- Understand why a **closed error taxonomy** is the precondition for engine-level retry policy.
- Internalize the course's spine: **every action declares its idempotency strategy**, enforced at boot.

## Key concepts
- **Data-not-code plugin surface.** Connectors are `defineConnector` definitions with zod schemas, not
  free functions. Because they're *data*, they can be introspected (auto-generate builder forms in S04),
  validated (the registry enforces invariants), and versioned (S14). Code-as-plugin can only be
  executed — never described, checked, or evolved safely.
- **The closed error taxonomy is load-bearing.** `ctx.http` normalizes every vendor failure into exactly
  five kinds: `RateLimited | AuthFailed | VendorDown | BadInput | Unknown`. Why closed? Because S07's
  engine makes retry decisions *per class* — retry `RateLimited`/`VendorDown`, never `AuthFailed`/
  `BadInput`. An open-ended set of vendor-specific error shapes makes a single retry policy impossible;
  normalization is what makes engine-level retry logic exist at all.
- **Idempotency is mandatory, and the two strategies contrast on facing pages.** MailPost's `send-email`
  uses `vendorKey` (the vendor dedupes; we just forward `ctx.idempotencyKey`). SheetLite's `add-row`
  uses `naturalKey` (the vendor has no idempotency, so *we* derive a stable key from the input and the
  engine dedupes). Read both `execute` bodies and note who carries the burden. An action that forgets to
  declare a strategy fails registration at boot — not at 3am when the engine retries it.
- **`ctx.http`, never `fetch`.** All network access funnels through one chokepoint, so auth injection,
  error normalization, and (S11) rate limiting are changed in one place. A lint rule forbids raw `fetch`
  in connectors — the chokepoint is only a chokepoint if nothing bypasses it.
- **Pagination is absorbed once.** `cursorPaginer` / `pagePaginer` turn every vendor's paging style into
  one flat async iterator. Each adapter is ~a dozen lines; connector authors never think about paging.
- **Contract tests are the SDK's real spec.** An SDK without conformance tests is a suggestion. These
  tests (idempotency present, schema introspectable, error taxonomy honored) are the seed of S14's
  certification harness — the learner's connector must pass an expanded version.

## The quality metric
A good SDK is measured by the **second connector's diff size**. SheetLite was ~140 lines, most of it
the two zod schemas. If the second connector is small, the abstraction absorbed the vendor mess; if it's
large, the SDK leaked. Watch this metric as ChatBox (S06) and the learner's connector (S14) arrive.

## Exercise questions
1. MailPost declares `vendorKey`, SheetLite declares `naturalKey`. For each, describe exactly what
   happens on an engine retry after a crash, and who prevents the duplicate.
2. Why must the error taxonomy be *closed*? Construct a retry policy that would be impossible if
   connectors surfaced raw vendor errors.
3. ChatBox returns `200 { ok:false }` on auth failure. Trace how `ctx.http` (S3) and, later, a ChatBox
   connector must handle it so the engine sees `AuthFailed`, not success.
4. The registry rejects an action with no idempotency at boot. Why boot-time and not run-time? What's
   the failure mode of the run-time alternative?

## Deferred (linked issues)
- ChatBox connector (S06 needs it) · dynamic dropdown options for the builder (S04) · richer schema
  introspection (S04 forms) · a lint rule enforcing "no raw fetch in connectors".

## Further reading
- Declarative plugin architectures & registries · Adapter pattern · Error taxonomies and typed failures
  · zod schema introspection · Idempotency keys (Stripe's model)
