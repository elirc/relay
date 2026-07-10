# ADR-0007: Retry policy keyed on the error taxonomy; fail-fast run semantics

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S05
- **Deciders:** Relay authors

## Context
The engine executes steps that call flaky vendors. Some failures should be retried (a transient 503, a
rate limit), some must never be (a 400, a revoked token). We need a retry policy that's legible and
uniform — not per-vendor conditionals scattered through connectors — and we need to decide what a run
does when a step ultimately fails.

## Decision
**Retry is a small table keyed on the S3 error taxonomy** (`packages/../executor.ts` `retryPolicy`):
- `RateLimited` → retry, honoring `Retry-After` (retrying sooner is aggression that earns a longer ban).
- `VendorDown` → retry with exponential backoff (transient).
- `AuthFailed` → do not retry (the connection needs re-auth; retrying spams a dead credential).
- `BadInput` → do not retry (our request was wrong; the same request will fail identically).
- anything else → do not retry (conservative default).
Capped at `MAX_ATTEMPTS`.

**Run semantics: fail-fast.** A step that exhausts retries fails the whole run. That's the behavior we
can explain in one sentence, which is the right bar for a v1.

## Alternatives considered
- **Per-connector retry logic.** Each connector decides its own retries. Flexible, but you get N
  inconsistent implementations, and the engine can't reason about or bound total work. The closed
  taxonomy (S3) exists precisely so this policy can live in one place.
- **Retry everything a few times.** Simple, but retrying `BadInput` is pointless spam and retrying
  `AuthFailed` hammers a revoked token (and can trigger vendor lockouts). Retryability is a property of
  the error *class*, and the taxonomy encodes it.
- **Continue-on-error (run the rest of the relay when a step fails).** Tempting, but partial side
  effects across a half-run relay confuse users badly. Real error-handling *paths* (try/catch branches)
  are graph structure — they belong to S08's DAG, not to v1's linear model. So this "alternative" is
  really a roadmap pointer.

## Consequences
- Retry policy is ~10 lines and identical across all vendors; adding a vendor changes nothing here.
- Fail-fast is predictable but brittle to one flaky step; S08 adds error paths, S07 adds durability so a
  retry after a crash doesn't double-fire.
- **The honest limitation (flaw #2 + the crash window):** step outputs are stored inline as JSONB
  (large vendor responses will bloat the runs table — harvested S10), and a crash *between* a side
  effect landing and its persistence still duplicates that side effect. S05 narrows the window
  (resume-from-last-persisted) but does not close it. The real close — checkpoint + idempotency
  enforcement — is S07. We shipped an engine that works and documented exactly how it can lie.

## Links
- `apps/engine/src/executor.ts` (+ tests), `docs/sprints/sprint-05.md`, ADR-0005 (error taxonomy)
