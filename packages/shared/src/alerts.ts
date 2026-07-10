/**
 * Alert storm suppression (S12). A relay failing 1,000×/hour must send ONE alert (plus maybe a digest),
 * not 1,000 — alerting on failures must itself be rate-limited, or you've built a spam cannon that trains
 * builders to mute you. First failure in a window alerts immediately; the rest are counted for a digest.
 */
export interface AlertDecision {
  send: boolean;
  kind: "immediate" | "suppress";
  count: number; // total in the current window (for the eventual digest)
}

export class AlertThrottle {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Offer a failure for alerting. Returns whether to send now, and the running count for the window. */
  offer(key: string): AlertDecision {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start >= this.windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      return { send: true, kind: "immediate", count: 1 };
    }
    w.count += 1;
    return { send: false, kind: "suppress", count: w.count };
  }

  /** How many failures have been suppressed in `key`'s current window (for a digest send). */
  suppressedCount(key: string): number {
    const w = this.windows.get(key);
    return w ? Math.max(0, w.count - 1) : 0;
  }
}
