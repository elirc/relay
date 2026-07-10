import { describe, it, expect } from "vitest";
import { computeRelayHealth } from "./health";

describe("computeRelayHealth", () => {
  it("computes success rate, p95 duration, and an error-class breakdown", () => {
    const h = computeRelayHealth([
      { status: "succeeded", durationMs: 100 },
      { status: "succeeded", durationMs: 200 },
      { status: "failed", durationMs: 300, errorClass: "RateLimited" },
      { status: "failed", durationMs: 400, errorClass: "RateLimited" },
    ]);
    expect(h.total).toBe(4);
    expect(h.successRate).toBe(0.5);
    expect(h.errorBreakdown).toEqual({ RateLimited: 2 });
    expect(h.p95DurationMs).toBe(400); // the tail, not the mean
  });

  it("an empty history is vacuously healthy", () => {
    expect(computeRelayHealth([])).toEqual({ total: 0, successRate: 1, p95DurationMs: 0, errorBreakdown: {} });
  });
});
