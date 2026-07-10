import { describe, it, expect } from "vitest";
import { executeFanout } from "./fanout";

describe("fan-out — the S7 durability dividend at scale", () => {
  it("per-item checkpoints let a crashed fan-out resume without re-running completed items", async () => {
    const items = [0, 1, 2, 3, 4];

    // Attempt 1: concurrency 1 (deterministic), crashes on item 2.
    const sent1: number[] = [];
    await expect(
      executeFanout(items, 1, {
        runItem: async (_item, i) => {
          if (i === 2) throw new Error("crash mid-fan-out");
          sent1.push(i);
          return i;
        },
      }),
    ).rejects.toThrow("crash");
    expect(sent1).toEqual([0, 1]); // 0 and 1 fired their side effect and were checkpointed

    // Resume: items 0 and 1 are done → rehydrated, NOT re-run; only 2,3,4 execute.
    const done = new Set([0, 1]);
    const sent2: number[] = [];
    const out = await executeFanout(items, 2, {
      runItem: async (_item, i) => {
        sent2.push(i);
        return i * 10;
      },
      isItemDone: (i) => done.has(i),
      loadItemOutput: (i) => i * 10,
    });

    expect([...sent2].sort((a, b) => a - b)).toEqual([2, 3, 4]); // 0,1 not re-sent
    expect(out).toEqual([0, 10, 20, 30, 40]); // 0,1 rehydrated, 2–4 fresh
  });
});
