import { describe, it, expect } from "vitest";
import { executeRun, type ExecDeps, type StepInput } from "./executor";
import { deriveIdempotencyKey } from "./idempotency";

/**
 * The flagship (S07). This is the SAME crash scenario as `executor.test.ts` (S05), but now the side
 * effect goes through a vendor that dedupes on the idempotency key. The difference between the two test
 * outputs is the entire value of this sprint: S05 duplicated; S07 does not.
 */

// A vendor whose durable dedupe store SURVIVES our crash — it's an external system. A repeated key
// returns the cached result and performs NO new side effect.
function keyedVendor() {
  const sent: string[] = [];
  const cache = new Map<string, unknown>();
  return {
    sent,
    call(key: string, label: string) {
      if (cache.has(key)) return cache.get(key);
      sent.push(label);
      const result = { id: `id_${sent.length}` };
      cache.set(key, result);
      return result;
    },
  };
}

const steps: StepInput[] = [
  { id: "send-email", connector: "mailpost", action: "send-email", config: {} },
  { id: "post-chat", connector: "chatbox", action: "post-message", config: {} },
];

// The checkpoint store (`persisted`) and `completed` set are DURABLE — they survive the crash, like the
// database would. A fresh "process" (rig) reads the same store on resume.
function rig(vendor: ReturnType<typeof keyedVendor>, persisted: Map<number, unknown>, crashOnIndex?: number) {
  const deps: ExecDeps = {
    renderConfig: (c) => c,
    runAction: async (step) => {
      // The engine derives a STABLE key per step; the vendor dedupes on it.
      const key = deriveIdempotencyKey({ strategy: "vendorKey", header: "Idempotency-Key" }, "run-1", step.id, {});
      return vendor.call(key, step.id);
    },
    persistStep: async (index, _step, output) => {
      if (index === crashOnIndex) throw new Error("CRASH: died before checkpoint commit");
      persisted.set(index, output);
    },
    loadPersistedOutput: async (index) => persisted.get(index),
    emit: () => {},
    sleep: async () => {},
  };
  return deps;
}

describe("flagship — durable resume + idempotent side effects", () => {
  it("crash in the ugly window (side effect landed, checkpoint didn't) → resume does NOT duplicate", async () => {
    const vendor = keyedVendor();
    const persisted = new Map<number, unknown>();
    const completed = new Set<number>();

    // Attempt 1: step 0 commits; step 1 sends its side effect, then crashes BEFORE the checkpoint.
    await expect(executeRun(steps, {}, rig(vendor, persisted, 1), completed)).rejects.toThrow("CRASH");
    expect(vendor.sent).toEqual(["send-email", "post-chat"]);
    expect(completed.has(0)).toBe(true);
    expect(completed.has(1)).toBe(false); // step 1's checkpoint never committed

    // Resume (new "process", same durable stores + same vendor): step 0 rehydrates; step 1 re-runs with
    // the SAME idempotency key → the vendor recognizes it and performs no second side effect.
    await executeRun(steps, {}, rig(vendor, persisted), completed);

    // The whole point: each side effect happened EXACTLY once, even though step 1 executed twice. In S05
    // this same scenario sent post-chat twice — the crash window is now closed by the key that traveled
    // with the side effect.
    expect(vendor.sent).toEqual(["send-email", "post-chat"]);
    expect(vendor.sent.filter((s) => s === "post-chat").length).toBe(1);
  });
});
