import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("preserves result order regardless of completion order", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (x) => {
      await new Promise((r) => setTimeout(r, (5 - x) * 5)); // later items finish first
      return x * 10;
    });
    expect(out).toEqual([10, 20, 30, 40]);
  });

  it("never exceeds the concurrency limit (don't melt the vendor)", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([...Array(12).keys()], 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });
});
