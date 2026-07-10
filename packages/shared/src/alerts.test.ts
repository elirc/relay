import { describe, it, expect } from "vitest";
import { AlertThrottle } from "./alerts";

describe("AlertThrottle (no spam cannon)", () => {
  it("first failure alerts immediately; the rest are suppressed and counted for a digest", () => {
    const t = 0;
    const a = new AlertThrottle(1000, () => t);
    expect(a.offer("relay1").kind).toBe("immediate");
    for (let i = 0; i < 998; i++) a.offer("relay1");
    expect(a.offer("relay1")).toEqual({ send: false, kind: "suppress", count: 1000 });
    expect(a.suppressedCount("relay1")).toBe(999); // 1000 failures → 1 alert + a digest of 999
  });

  it("a new window alerts immediately again", () => {
    let t = 0;
    const a = new AlertThrottle(1000, () => t);
    a.offer("r");
    t = 1000; // window elapsed
    expect(a.offer("r").kind).toBe("immediate");
  });

  it("different relays don't suppress each other", () => {
    const a = new AlertThrottle(1000, () => 0);
    expect(a.offer("relayA").kind).toBe("immediate");
    expect(a.offer("relayB").kind).toBe("immediate");
  });
});
