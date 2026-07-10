/**
 * Stuck-run detection + per-connector circuit breaker (S15).
 *
 * The classic pileup: a step waits on a hung vendor *forever*, and enough of them consume the whole
 * worker fleet — one bad vendor takes down everyone's automations. Detection + auto-timeout stops the
 * unbounded wait; the circuit breaker stops us from hammering a vendor that's already down.
 *
 * This is the stuck-run debate resolution: auto-timeout to a **retriable-failed** state (not a hard fail
 * that loses legitimately-slow runs, not a blind retry into the same hung vendor), with a **breaker** —
 * a degraded connector trips it, briefly HOLDING its runs rather than pounding it, then probing to see if
 * it recovered. *Timeouts are the start of a policy, not the end — decide what the timeout leads to.*
 */
export type BreakerState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private state: BreakerState = "closed";

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** May we call the vendor right now? Open = hold; after cooldown, allow ONE half-open probe. */
  canRequest(): boolean {
    if (this.state !== "open") return true;
    if (this.now() - this.openedAt >= this.cooldownMs) {
      this.state = "half-open"; // let one request through to test the water
      return true;
    }
    return false;
  }

  onSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  onFailure(): void {
    this.failures += 1;
    // A failed probe re-opens immediately; otherwise open once we cross the threshold.
    if (this.state === "half-open" || this.failures >= this.threshold) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }

  get current(): BreakerState {
    return this.state;
  }
}

/**
 * Is a run stuck? A step running longer than its expected duration times a grace factor is presumed hung
 * (a heartbeat per active step distinguishes "slow" from "dead" in production). Detection feeds the
 * auto-timeout so a hung vendor can't hold a worker indefinitely.
 */
export function isStuck(startedAtMs: number, now: number, expectedMs: number, graceFactor = 3): boolean {
  return now - startedAtMs > expectedMs * graceFactor;
}
