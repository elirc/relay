import { describe, it, expect } from "vitest";
import { TokenBucket } from "./fairness/token-bucket";
import { pickOrg, pickLane } from "./fairness/scheduler";

describe("TokenBucket (the shared vendor budget)", () => {
  it("allows up to capacity, then refuses until refill", () => {
    let t = 0;
    const b = new TokenBucket(3, 1, () => t);
    expect([b.tryTake(), b.tryTake(), b.tryTake()]).toEqual([true, true, true]);
    expect(b.tryTake()).toBe(false); // budget spent
    t = 2000; // 2s later → +2 tokens
    expect([b.tryTake(), b.tryTake(), b.tryTake()]).toEqual([true, true, false]);
  });

  it("learns from Retry-After: penalize defers refill for the vendor's cooldown", () => {
    let t = 0;
    const b = new TokenBucket(5, 1, () => t);
    b.tryTake(5); // spend all
    b.penalize(3000); // vendor 429'd, said wait 3s
    t = 2000;
    expect(b.tryTake()).toBe(false); // still cooling down
    t = 4000;
    expect(b.available).toBeGreaterThan(0); // cooldown elapsed, refilling again
  });
});

describe("weighted fair queuing (no noisy neighbor)", () => {
  it("serves the org with the lowest inFlight/weight ratio — the single run isn't starved", () => {
    expect(
      pickOrg([
        { orgId: "busy", weight: 1, inFlight: 5, pending: 100, cap: 10 },
        { orgId: "quiet", weight: 1, inFlight: 0, pending: 1, cap: 10 },
      ]),
    ).toBe("quiet");
  });

  it("respects per-org caps and gives higher weights proportionally more", () => {
    expect(pickOrg([{ orgId: "a", weight: 1, inFlight: 3, pending: 5, cap: 3 }])).toBeNull(); // at cap
    expect(
      pickOrg([
        { orgId: "free", weight: 1, inFlight: 2, pending: 5, cap: 10 }, // ratio 2
        { orgId: "pro", weight: 4, inFlight: 4, pending: 5, cap: 10 }, // ratio 1 → wins
      ]),
    ).toBe("pro");
  });
});

describe("priority lanes with a reserved minimum", () => {
  it("prefers interactive, but serves bulk after the starvation limit", () => {
    const depth = { interactive: 1, scheduled: 1, bulk: 1 };
    expect(pickLane(depth, 0)).toBe("interactive");
    expect(pickLane(depth, 5)).toBe("bulk"); // no lane fully starves
  });

  it("falls through to lower lanes when higher ones are empty", () => {
    expect(pickLane({ interactive: 0, scheduled: 2, bulk: 1 }, 0)).toBe("scheduled");
    expect(pickLane({ interactive: 0, scheduled: 0, bulk: 0 }, 0)).toBeNull();
  });
});
