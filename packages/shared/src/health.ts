/**
 * Per-relay health metrics (S12): success rate, p95 duration, and an error-class breakdown. These are
 * the numbers a builder needs to know if a relay is healthy — and the per-relay percentiles feed S15's
 * SLOs. Measure before you promise.
 */
export interface RelayRunSample {
  status: "succeeded" | "failed";
  durationMs: number;
  errorClass?: string;
}

export interface RelayHealth {
  total: number;
  successRate: number; // 0..1
  p95DurationMs: number;
  errorBreakdown: Record<string, number>;
}

/** Nearest-rank percentile — the metric users feel is the tail, not the mean (🔗 the S15 SLO lesson). */
export function percentile(samples: readonly number[], q: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length)));
  return sorted[rank - 1] as number;
}

export function computeRelayHealth(runs: readonly RelayRunSample[]): RelayHealth {
  const total = runs.length;
  const succeeded = runs.filter((r) => r.status === "succeeded").length;
  const errorBreakdown: Record<string, number> = {};
  for (const r of runs) {
    if (r.status === "failed") {
      const cls = r.errorClass ?? "Unknown";
      errorBreakdown[cls] = (errorBreakdown[cls] ?? 0) + 1;
    }
  }
  return {
    total,
    successRate: total === 0 ? 1 : succeeded / total,
    p95DurationMs: percentile(runs.map((r) => r.durationMs), 0.95),
    errorBreakdown,
  };
}
