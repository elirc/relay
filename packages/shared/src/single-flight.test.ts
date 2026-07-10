import { describe, it, expect } from "vitest";
import { SingleFlight } from "./single-flight";

describe("SingleFlight", () => {
  it("collapses concurrent calls for the same key into one execution", async () => {
    const sf = new SingleFlight<number>();
    let calls = 0;
    const fn = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return 42;
    };

    const [a, b, c] = await Promise.all([sf.run("k", fn), sf.run("k", fn), sf.run("k", fn)]);
    expect(calls).toBe(1); // one execution, shared by all three
    expect([a, b, c]).toEqual([42, 42, 42]);
  });

  it("different keys run independently", async () => {
    const sf = new SingleFlight<string>();
    let calls = 0;
    const fn = (v: string) => async () => {
      calls++;
      return v;
    };
    const [a, b] = await Promise.all([sf.run("k1", fn("a")), sf.run("k2", fn("b"))]);
    expect(calls).toBe(2);
    expect([a, b]).toEqual(["a", "b"]);
  });

  it("starts a fresh run after the previous settled (next expiry gets a new refresh)", async () => {
    const sf = new SingleFlight<number>();
    let calls = 0;
    const fn = async () => ++calls;
    expect(await sf.run("k", fn)).toBe(1);
    expect(await sf.run("k", fn)).toBe(2); // not cached — coalescing is only for concurrency
  });

  it("a failed flight rejects all joiners and does not poison the next call", async () => {
    const sf = new SingleFlight<number>();
    let attempt = 0;
    const fn = async () => {
      attempt++;
      if (attempt === 1) throw new Error("boom");
      return 7;
    };
    await expect(Promise.all([sf.run("k", fn), sf.run("k", fn)])).rejects.toThrow("boom");
    expect(await sf.run("k", fn)).toBe(7); // recovered
  });
});
