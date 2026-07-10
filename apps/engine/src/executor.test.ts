import { describe, it, expect } from "vitest";
import { ConnectorError } from "@relay/connector-sdk";
import { retryPolicy, executeRun, MAX_ATTEMPTS, type ExecDeps, type StepInput } from "./executor";

describe("retryPolicy (the taxonomy pays off)", () => {
  it("RateLimited honors Retry-After", () => {
    const e = new ConnectorError("RateLimited", "slow down", 5000);
    expect(retryPolicy(e, 1)).toEqual({ retry: true, delayMs: 5000 });
  });
  it("VendorDown backs off exponentially", () => {
    const e = new ConnectorError("VendorDown", "500");
    expect(retryPolicy(e, 1).retry).toBe(true);
    expect(retryPolicy(e, 2).delayMs).toBeGreaterThan(retryPolicy(e, 1).delayMs);
  });
  it("AuthFailed and BadInput never retry", () => {
    expect(retryPolicy(new ConnectorError("AuthFailed", "401"), 1).retry).toBe(false);
    expect(retryPolicy(new ConnectorError("BadInput", "400"), 1).retry).toBe(false);
  });
  it("stops after MAX_ATTEMPTS even for retryable errors", () => {
    expect(retryPolicy(new ConnectorError("VendorDown", "x"), MAX_ATTEMPTS).retry).toBe(false);
  });
});

/** A test rig: `sent` records real side effects (emails/chats); persist can be made to crash. */
function rig(crashPersistOnIndex?: number) {
  const sent: string[] = [];
  const persisted = new Map<number, unknown>();
  const deps: ExecDeps = {
    renderConfig: (config) => config, // configs are already literals in these tests
    runAction: async (step) => {
      sent.push(step.id); // THE side effect
      return { ok: step.id };
    },
    persistStep: async (index, _step, output) => {
      if (index === crashPersistOnIndex) throw new Error("CRASH: process died before persisting");
      persisted.set(index, output);
    },
    loadPersistedOutput: async (index) => persisted.get(index),
    emit: () => {},
    sleep: async () => {},
  };
  return { sent, persisted, deps };
}

const steps: StepInput[] = [
  { id: "send-email", connector: "mailpost", action: "send-email", config: {} },
  { id: "post-chat", connector: "chatbox", action: "post-message", config: {} },
];

describe("the duplicate-side-effect arc (S05 → S07)", () => {
  it("NAIVE restart (no resume) re-runs EVERY step — a crash in step 2 re-sends step 1's email", async () => {
    // First attempt: step 0 persists, step 1's persist crashes.
    const r = rig(1);
    await expect(executeRun(steps, {}, r.deps, new Set())).rejects.toThrow(/CRASH/);
    expect(r.sent).toEqual(["send-email", "post-chat"]);

    // Restart with a FRESH completed set (no resume) — both steps run again.
    const r2 = rig(); // no crash this time
    await executeRun(steps, {}, r2.deps, new Set());
    // Across the two attempts the email side effect fired TWICE. This is the automation platform's
    // original sin: your DB can't tell you what the vendor already received.
    const totalEmails = r.sent.filter((s) => s === "send-email").length + r2.sent.filter((s) => s === "send-email").length;
    expect(totalEmails).toBe(2);
  });

  it("PARTIAL FIX (resume from last persisted) narrows the window: the email is NOT re-sent, only the in-flight step is", async () => {
    const completed = new Set<number>();
    const r = rig(1); // step 0 persists (added to completed), step 1 crashes
    await expect(executeRun(steps, {}, r.deps, completed)).rejects.toThrow(/CRASH/);
    expect(completed.has(0)).toBe(true); // send-email is durably done
    expect(completed.has(1)).toBe(false); // post-chat crashed before persist

    // Resume sharing the completed set — step 0 is restored, NOT re-executed; step 1 re-runs.
    const r2 = rig();
    await executeRun(steps, {}, r2.deps, completed);
    expect(r2.sent).toEqual(["post-chat"]); // the email was NOT re-sent — window narrowed
    // ...but post-chat DID fire twice across attempts. The remaining window is the in-flight step;
    // closing it entirely needs checkpoint + idempotency enforcement — that's S07.
    const totalChats = r.sent.filter((s) => s === "post-chat").length + r2.sent.filter((s) => s === "post-chat").length;
    expect(totalChats).toBe(2);
  });
});
