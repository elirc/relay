import { describe, it, expect } from "vitest";
import { isBillable, meterRun, quotaState, type MeterableStep } from "./metering";

describe("metering (the billing contract)", () => {
  it("only successful ACTION steps are billable", () => {
    expect(isBillable({ runId: "r", stepId: "s", type: "action", status: "succeeded" })).toBe(true);
    expect(isBillable({ runId: "r", stepId: "s", type: "action", status: "failed" })).toBe(false);
    expect(isBillable({ runId: "r", stepId: "s", type: "filter", status: "succeeded" })).toBe(false);
    expect(isBillable({ runId: "r", stepId: "s", type: "trigger", status: "succeeded" })).toBe(false);
  });

  it("idempotent: a step metered twice (retry/replay) counts once", () => {
    const steps: MeterableStep[] = [
      { runId: "r1", stepId: "s0", type: "action", status: "succeeded" },
      { runId: "r1", stepId: "s0", type: "action", status: "succeeded" }, // a retry of the same step
      { runId: "r1", stepId: "s1", type: "filter", status: "succeeded" }, // not billable
      { runId: "r1", stepId: "s2", type: "action", status: "failed" }, // free (our unreliability)
    ];
    expect(meterRun(steps)).toEqual([{ runId: "r1", stepId: "s0" }]);
  });

  it("quota: ok / warn (80%) / over", () => {
    expect(quotaState(50, 100)).toBe("ok");
    expect(quotaState(85, 100)).toBe("warn");
    expect(quotaState(100, 100)).toBe("over");
  });
});
