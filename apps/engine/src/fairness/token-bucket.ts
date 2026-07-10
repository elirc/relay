/**
 * A token-bucket rate governor (S11). Every vendor call passes through it (the S03 `ctx.http` chokepoint
 * is why that's possible). Two subtleties the course is built around:
 *
 * 1. **The budget is the VENDOR's per-account limit**, so all of our orgs sharing one connection share
 *    ONE bucket. Per-worker or per-org buckets silently multiply the real rate by N and get the account
 *    banned. In production this bucket is distributed (Redis + a Lua script for an atomic take); the
 *    logic lives here, pure, so the atomicity requirement is legible.
 * 2. **The vendor tells you its real rate via 429s.** A governor that LEARNS from `Retry-After` beats a
 *    statically-configured guess — `penalize()` drains the bucket and defers refill for the vendor's
 *    stated cooldown.
 *
 * ⚠️ `tryTake` is check-then-decrement. In-process that's atomic (single-threaded JS); ACROSS workers it
 * races, and a non-atomic take makes the bucket lie (two workers both see "1 left" and both take it).
 * That's the same distributed-counter race every course meets (seq assignment, invoice numbers) in a
 * new costume — the Redis version MUST do the take atomically.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    if (t <= this.last) return; // penalized into the future — no refill yet
    const elapsedSec = (t - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    this.last = t;
  }

  /** Take `n` tokens if available. Returns false (don't call the vendor) when the budget is spent. */
  tryTake(n = 1): boolean {
    this.refill();
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  /** The vendor 429'd us: empty the bucket and defer refill until the stated cooldown elapses. */
  penalize(retryAfterMs: number): void {
    this.refill();
    this.tokens = 0;
    this.last = this.now() + retryAfterMs; // refill() won't add tokens until wall-clock passes this
  }

  get available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}
