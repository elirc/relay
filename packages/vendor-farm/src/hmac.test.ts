import { describe, it, expect } from "vitest";
import { signPayload, verifySignature } from "./hmac";

const secret = "whsec_test";
const body = JSON.stringify({ type: "row.created", id: "row_1" });

describe("HMAC webhook signatures", () => {
  it("a freshly signed payload verifies", () => {
    const now = 1_700_000_000_000;
    const header = signPayload(body, secret, now);
    expect(verifySignature(body, header, secret, { now, toleranceSec: 300 })).toBe(true);
  });

  it("a tampered body fails verification", () => {
    const now = 1_700_000_000_000;
    const header = signPayload(body, secret, now);
    expect(verifySignature(body + "x", header, secret, { now })).toBe(false);
  });

  it("the wrong secret fails verification", () => {
    const now = 1_700_000_000_000;
    const header = signPayload(body, secret, now);
    expect(verifySignature(body, header, "whsec_other", { now })).toBe(false);
  });

  it("a stale (replayed) signature is rejected past the tolerance window", () => {
    const signedAt = 1_700_000_000_000;
    const header = signPayload(body, secret, signedAt);
    const later = signedAt + 10 * 60 * 1000; // 10 minutes later
    expect(verifySignature(body, header, secret, { now: later, toleranceSec: 300 })).toBe(false);
  });
});
