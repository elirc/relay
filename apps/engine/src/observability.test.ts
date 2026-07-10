import { describe, it, expect } from "vitest";
import { CircuitBreaker, isStuck } from "./observability/breaker";
import { EngineMetrics } from "./observability/metrics";
import { RunTrace } from "./observability/trace";

describe("CircuitBreaker (a hung vendor mustn't consume the fleet)", () => {
  it("closed → open after threshold failures; open holds requests", () => {
    const t = 0;
    const b = new CircuitBreaker(3, 1000, () => t);
    expect(b.canRequest()).toBe(true);
    b.onFailure();
    b.onFailure();
    b.onFailure();
    expect(b.current).toBe("open");
    expect(b.canRequest()).toBe(false); // holding the degraded vendor's runs instead of hammering it
  });

  it("after cooldown → half-open probe; success closes, a failed probe re-opens", () => {
    let t = 0;
    const b = new CircuitBreaker(1, 1000, () => t);
    b.onFailure();
    expect(b.current).toBe("open");

    t = 1000;
    expect(b.canRequest()).toBe(true); // one probe allowed
    expect(b.current).toBe("half-open");
    b.onSuccess();
    expect(b.current).toBe("closed"); // vendor recovered

    b.onFailure(); // open again
    t = 3000;
    b.canRequest(); // → half-open
    b.onFailure(); // failed probe
    expect(b.current).toBe("open");
  });
});

describe("isStuck", () => {
  it("flags a run past expected × grace", () => {
    expect(isStuck(0, 5000, 1000, 3)).toBe(true); // 5000 > 3000
    expect(isStuck(0, 2000, 1000, 3)).toBe(false);
  });
});

describe("EngineMetrics — the breakdown surfaces the story", () => {
  it("per-connector + error-class breakdown reveals which vendor is degraded", () => {
    const m = new EngineMetrics();
    for (let i = 0; i < 10; i++) m.recordStep(100);
    m.recordFailure("mailpost", "RateLimited");
    m.recordFailure("mailpost", "RateLimited");
    m.recordFailure("sheetlite", "VendorDown");
    const s = m.snapshot();
    expect(s.failuresByConnector).toEqual({ mailpost: 2, sheetlite: 1 }); // "MailPost is the problem"
    expect(s.failuresByErrorClass.RateLimited).toBe(2);
    expect(s.stepLatencyP95Ms).toBe(100);
    expect(s.failureRate).toBeCloseTo(0.3);
  });
});

describe("RunTrace", () => {
  it("stitches spans by run id and surfaces vendor rate-limit wait time", () => {
    const tr = new RunTrace("run-1");
    tr.add({ name: "trigger", startMs: 0, endMs: 10, kind: "trigger" });
    tr.add({ name: "send-email", startMs: 10, endMs: 210, kind: "vendor", governorWaitMs: 150 });
    expect(tr.totalMs).toBe(210);
    expect(tr.vendorWaitMs).toBe(150); // most of the "slow" was rate-limit wait, not our engine
  });
});
