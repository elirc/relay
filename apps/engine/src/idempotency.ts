import type { IdempotencyStrategy } from "@relay/connector-sdk";

/**
 * Derive the idempotency key for a step from the connector's DECLARED strategy (S03). In S3 the
 * declaration was a promise; here it becomes mechanism. The key is **stable across every retry and
 * resume of the same logical step** — that stability is the whole point: it's what lets the vendor
 * (vendorKey/naturalKey) or the engine (dedupeWindow) recognize a repeat and refuse to act twice.
 *
 * The deepest idea in the course lives here: our database and the vendor's database commit at different
 * instants, so "resume from our last write" (S05's partial fix) can't be enough — a crash between the
 * vendor's ack and our checkpoint leaves us not knowing. The only thing that survives that gap is a key
 * that travels WITH the side effect to the system that actually performed it.
 */
export function deriveIdempotencyKey(
  strategy: IdempotencyStrategy,
  runId: string,
  stepId: string,
  input: unknown,
): string {
  switch (strategy.strategy) {
    case "vendorKey":
      // Per-step key the vendor dedupes on. Same run+step ⇒ same key across every attempt and resume.
      return `${runId}:${stepId}`;
    case "naturalKey":
      // Content-derived: the same input anywhere yields the same key, so even a different run can't
      // double-apply the same logical effect.
      return strategy.key(input);
    case "dedupeWindow":
      // Best-effort per-run key, enforced engine-side by a short-TTL seen-set. At-least-once — see the
      // honesty note surfaced to the builder.
      return `${runId}:${stepId}`;
  }
}

/** Which header carries the key to the vendor, if any. `dedupeWindow` sends nothing (engine-enforced). */
export function idempotencyHeader(strategy: IdempotencyStrategy): string | null {
  if (strategy.strategy === "vendorKey") return strategy.header;
  if (strategy.strategy === "naturalKey") return "Idempotency-Key";
  return null;
}
