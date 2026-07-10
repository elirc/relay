/**
 * Scheduling for polling + schedule triggers (S06).
 *
 * Fixed intervals per plan tier (the debate resolution): predictable load and billing beat adaptive
 * back-off, which is efficient but spooky ("why was my trigger slow today?").
 */
export type PlanTier = "free" | "pro" | "business";

export function intervalForTier(tier: PlanTier): number {
  switch (tier) {
    case "business":
      return 60_000; // 1 min
    case "pro":
      return 5 * 60_000; // 5 min
    default:
      return 15 * 60_000; // 15 min
  }
}

/**
 * Stagger a trigger's tick within its interval by hashing its id. Without this, N thousand polling
 * triggers all fire on the round minute — a self-inflicted DDoS on us AND a vendor-relations incident
 * (every vendor sees a spike at :00). Hashing by trigger id spreads them deterministically across the
 * window, and the same trigger always lands in the same slot (stable, debuggable).
 */
export function staggerOffsetMs(triggerId: string, intervalMs: number): number {
  let h = 2166136261;
  for (let i = 0; i < triggerId.length; i++) {
    h ^= triggerId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % intervalMs;
}

/**
 * Misfire policy: what happens when the engine was DOWN across one or more scheduled ticks. This is an
 * infrastructure decision that belongs to the USER: "skip" (default) protects against a 3-day outage
 * turning into a 4,000-run stampede on recovery; "runOnce" collapses the missed backlog to a single
 * catch-up run for relays that must not miss a beat.
 */
export type MisfirePolicy = "skip" | "runOnce";

export function recoveryRuns(policy: MisfirePolicy, missedTicks: number): number {
  if (missedTicks <= 0) return 0;
  return policy === "runOnce" ? 1 : 0;
}
