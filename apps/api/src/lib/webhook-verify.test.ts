import { describe, it, expect } from "vitest";
import { signPayload } from "@relay/vendor-farm";
import { verifyWebhook, MemoryReplayGuard } from "./webhook-verify";

const secret = "whsec_binding";
const body = JSON.stringify({ type: "row.created", id: "row_1" });
const now = 1_700_000_000_000;

describe("verifyWebhook (flaw #4 fix)", () => {
  it("accepts a correctly signed, fresh, first-seen webhook", () => {
    const guard = new MemoryReplayGuard(300_000, () => now);
    const sig = signPayload(body, secret, now);
    expect(verifyWebhook(body, sig, secret, guard, now)).toBe("ok");
  });

  it("rejects an unsigned request (the 7-sprint hole)", () => {
    expect(verifyWebhook(body, undefined, secret, new MemoryReplayGuard(), now)).toBe("bad-signature");
  });

  it("rejects a forged signature and a tampered body", () => {
    const guard = new MemoryReplayGuard(300_000, () => now);
    const sig = signPayload(body, secret, now);
    expect(verifyWebhook(body, sig, "wrong-secret", guard, now)).toBe("bad-signature");
    expect(verifyWebhook(body + "x", sig, secret, guard, now)).toBe("bad-signature");
  });

  it("rejects a replayed (captured-and-resent) webhook", () => {
    const guard = new MemoryReplayGuard(300_000, () => now);
    const sig = signPayload(body, secret, now);
    expect(verifyWebhook(body, sig, secret, guard, now)).toBe("ok");
    expect(verifyWebhook(body, sig, secret, guard, now)).toBe("replayed"); // second time = replay
  });

  it("rejects a stale signature outside the timestamp window", () => {
    const guard = new MemoryReplayGuard(300_000, () => now);
    const sig = signPayload(body, secret, now);
    const later = now + 10 * 60 * 1000; // 10 min later, tolerance is 5 min
    expect(verifyWebhook(body, sig, secret, guard, later)).toBe("bad-signature");
  });
});
