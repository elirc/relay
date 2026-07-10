/**
 * Task metering (S12) — how automation platforms charge, and why the definition is a contract.
 *
 * A "task" is a **successful action step**. Filters, triggers, failures, and retries are NOT billable.
 * That's a deliberate, defensible policy (ADR-0014): we absorb the cost of our own unreliability
 * (retries/failures are free), and customers pay for work actually done, which they can reason about.
 * Billing definitions are load-bearing product decisions disguised as counters — customers WILL litigate
 * the edges, so the edges are enumerated, not left to a `count++` somewhere.
 */
export interface MeterableStep {
  runId: string;
  stepId: string;
  type: "action" | "filter" | "trigger";
  status: "succeeded" | "failed";
}

export function isBillable(step: MeterableStep): boolean {
  return step.type === "action" && step.status === "succeeded";
}

export interface UsageKey {
  runId: string;
  stepId: string;
}

/**
 * Idempotent metering, keyed on `(runId, stepId)`. A retry or a replay of the same step must never
 * double-count — the S07 idempotency instinct, applied to money. Feed this the same steps twice and you
 * still get one record per billable step.
 */
export function meterRun(steps: readonly MeterableStep[]): UsageKey[] {
  const seen = new Set<string>();
  const records: UsageKey[] = [];
  for (const step of steps) {
    if (!isBillable(step)) continue;
    const key = `${step.runId}:${step.stepId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({ runId: step.runId, stepId: step.stepId });
  }
  return records;
}

/**
 * Quota state. Hard limits on automation are scary (a paused relay = missed business events), so we
 * soft-warn first (at 80% by default) and hard-pause only at the limit — humane limits, not a cliff.
 */
export type QuotaState = "ok" | "warn" | "over";

export function quotaState(used: number, limit: number, warnAt = 0.8): QuotaState {
  if (used >= limit) return "over";
  if (used >= limit * warnAt) return "warn";
  return "ok";
}
