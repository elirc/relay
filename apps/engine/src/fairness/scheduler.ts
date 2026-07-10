/**
 * Weighted fair scheduling + priority lanes (S11) — stop one tenant from monopolizing the workers.
 */

export interface OrgClaim {
  orgId: string;
  weight: number; // plan tier: higher = more share
  inFlight: number; // runs currently executing for this org
  pending: number; // runs waiting
  cap: number; // per-org concurrency cap
}

/**
 * Pick the next org to service. FIFO is unfair under skew (one org's 5,000-item fan-out drowns another
 * org's single run). Weighted fair queuing serves the org with the lowest **inFlight / weight** ratio
 * among those that have pending work and are under their cap — so a low-traffic org is never starved by a
 * high-traffic one, and higher tiers get proportionally more throughput.
 */
export function pickOrg(claims: readonly OrgClaim[]): string | null {
  const eligible = claims.filter((c) => c.pending > 0 && c.inFlight < c.cap);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, c) =>
    c.inFlight / c.weight < best.inFlight / best.weight ? c : best,
  ).orgId;
}

export type Lane = "interactive" | "scheduled" | "bulk";
const LANE_ORDER: Lane[] = ["interactive", "scheduled", "bulk"];

/**
 * Choose the next lane to serve. Higher lanes win (a human waiting on a test-run has a different SLA than
 * a nightly backfill), BUT the lowest lane gets a **reserved minimum**: after `starvationLimit`
 * consecutive high-lane picks, we serve a waiting low lane so bulk work can't be starved to death.
 */
export function pickLane(
  depth: Record<Lane, number>,
  consecutiveHighPicks: number,
  starvationLimit = 5,
): Lane | null {
  const bulkWaiting = depth.bulk > 0;
  if (bulkWaiting && consecutiveHighPicks >= starvationLimit) return "bulk"; // reserved minimum
  for (const lane of LANE_ORDER) {
    if (depth[lane] > 0) return lane;
  }
  return null;
}
