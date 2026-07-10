import { describe, it, expect } from "vitest";
import { Deduper, dedupeTtlForInterval } from "./triggers/dedupe";
import { intervalForTier, staggerOffsetMs, recoveryRuns } from "./triggers/schedule";
import { reconcile } from "./triggers/reconcile";
import { detectNewItems } from "./triggers/cursor";

describe("Deduper (TTL window)", () => {
  it("fires a new key once and suppresses duplicates within the window", () => {
    const t = 1000;
    const d = new Deduper(500, () => t);
    expect(d.offer("row_1")).toBe(true); // new
    expect(d.offer("row_1")).toBe(false); // duplicate within window
    expect(d.offer("row_2")).toBe(true); // different item
  });

  it("lets the same key through again after the TTL expires (and evicts stale keys)", () => {
    let t = 0;
    const d = new Deduper(500, () => t);
    expect(d.offer("k")).toBe(true);
    t = 600; // past TTL
    expect(d.offer("k")).toBe(true); // window elapsed — a re-seen straggler is treated as new
    expect(d.size).toBe(1); // the expired key was evicted
  });

  it("ttl scales with the polling interval", () => {
    expect(dedupeTtlForInterval(60_000)).toBe(180_000);
  });
});

describe("scheduling", () => {
  it("interval per plan tier", () => {
    expect(intervalForTier("business")).toBe(60_000);
    expect(intervalForTier("pro")).toBe(300_000);
    expect(intervalForTier("free")).toBe(900_000);
  });

  it("stagger is deterministic and within the interval (no :00 herd)", () => {
    const off = staggerOffsetMs("trg_abc", 60_000);
    expect(off).toBe(staggerOffsetMs("trg_abc", 60_000)); // stable per trigger
    expect(off).toBeGreaterThanOrEqual(0);
    expect(off).toBeLessThan(60_000);
    expect(staggerOffsetMs("trg_abc", 60_000)).not.toBe(staggerOffsetMs("trg_xyz", 60_000));
  });

  it("misfire policy: skip drops the backlog, runOnce collapses it to one", () => {
    expect(recoveryRuns("skip", 4000)).toBe(0);
    expect(recoveryRuns("runOnce", 4000)).toBe(1);
    expect(recoveryRuns("runOnce", 0)).toBe(0);
  });
});

describe("webhook reconcile (mutually untrusted witnesses)", () => {
  it("registers what we want but the vendor lacks; deregisters vendor orphans", () => {
    const plan = reconcile(["a", "b", "c"], ["b", "c", "d"]);
    expect(plan.toRegister).toEqual(["a"]);
    expect(plan.toDeregister).toEqual(["d"]);
  });
});

describe("polling cursor / new-item detection", () => {
  const items = [{ id: "3" }, { id: "2" }, { id: "1" }]; // newest first

  it("first poll (no cursor) returns everything and sets the cursor to the newest", () => {
    expect(detectNewItems(items, null)).toEqual({ fresh: items, nextCursor: "3" });
  });

  it("subsequent poll returns only items newer than the cursor", () => {
    expect(detectNewItems(items, "1")).toEqual({ fresh: [{ id: "3" }, { id: "2" }], nextCursor: "3" });
  });

  it("if the cursor item vanished, treats all as fresh (better a dup than a miss)", () => {
    expect(detectNewItems(items, "gone").fresh).toEqual(items);
  });
});
