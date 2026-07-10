/**
 * Trigger dedupe (S06). A trigger that fires twice runs someone's automation twice — so before a
 * trigger event becomes a run, we check it hasn't been seen. The connector declares WHAT makes an item
 * unique (`trigger.dedupeKey`, S06 SDK change); this enforces it.
 *
 * ⚠️ Dedupe state can't grow forever. The TTL window is a real decision: it must be at least as long as
 * the farthest apart two duplicates can plausibly arrive — for polling that's roughly the polling
 * interval times a safety factor (a late poll can re-see an item one cycle later). Bigger wastes memory;
 * smaller lets a straggler duplicate slip through. `dedupeTtlForInterval` encodes that reasoning.
 *
 * Backed by Redis with per-key TTL in production; the logic lives here, pure and testable, so the
 * window reasoning is legible and the behavior is asserted rather than assumed.
 */
export class Deduper {
  private seen = new Map<string, number>(); // key -> expiry timestamp

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Returns true if this is a NEW item (fire it); false if a duplicate seen within the window. */
  offer(key: string): boolean {
    const t = this.now();
    this.evict(t);
    if (this.seen.has(key)) return false;
    this.seen.set(key, t + this.ttlMs);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }

  private evict(t: number): void {
    for (const [k, expiry] of this.seen) {
      if (expiry <= t) this.seen.delete(k);
    }
  }
}

/** Window = interval × safety factor: a late poll can re-surface an item roughly one cycle later. */
export function dedupeTtlForInterval(intervalMs: number): number {
  return intervalMs * 3;
}
