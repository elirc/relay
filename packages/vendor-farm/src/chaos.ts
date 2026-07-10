/**
 * Deterministic failure injection (S02, ADR-0003).
 *
 * Real vendors fail in ways you cannot reproduce on demand: a 429 with no Retry-After, a truncated
 * JSON body, a 503 during your retry. You can't unit-test "MailPost rate-limits us without a
 * Retry-After header" against the real MailPost. So the farm makes failure a **first-class, seeded
 * test input**: given the same seed, the same sequence of injections comes out — chaos you can assert
 * on. This is the "failure injection is always on" rule: every integration test runs through these
 * knobs, not just the S13 hardening sprint.
 */

/** A tiny seeded PRNG (mulberry32) — deterministic across machines, unlike Math.random(). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FailureConfig {
  /** fixed latency added to every response (ms) */
  latencyMs?: number;
  /** probability [0,1] of a 429 Too Many Requests */
  rate429?: number;
  /** if set, 429s carry this Retry-After (seconds); if undefined, they DON'T — the nastier case */
  retryAfterSec?: number;
  /** probability [0,1] of a 5xx */
  rate5xx?: number;
  /** probability [0,1] of a malformed (truncated) JSON body with a 200 status — the sneakiest failure */
  rateMalformed?: number;
}

export type Injection =
  | { kind: "ok"; delayMs: number }
  | { kind: "429"; delayMs: number; retryAfterSec?: number }
  | { kind: "5xx"; delayMs: number }
  | { kind: "malformed"; delayMs: number };

/**
 * Decide what failure (if any) to inject for one request, consuming one draw from `rng`. The bands are
 * disjoint and ordered, so probabilities compose predictably and a seed fully determines the outcome.
 */
export function injectFailure(cfg: FailureConfig, rng: () => number): Injection {
  const delayMs = cfg.latencyMs ?? 0;
  const p429 = cfg.rate429 ?? 0;
  const p5xx = cfg.rate5xx ?? 0;
  const pMal = cfg.rateMalformed ?? 0;
  const r = rng();
  if (r < p429) return { kind: "429", delayMs, retryAfterSec: cfg.retryAfterSec };
  if (r < p429 + p5xx) return { kind: "5xx", delayMs };
  if (r < p429 + p5xx + pMal) return { kind: "malformed", delayMs };
  return { kind: "ok", delayMs };
}
