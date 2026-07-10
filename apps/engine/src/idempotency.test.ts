import { describe, it, expect } from "vitest";
import { deriveIdempotencyKey, idempotencyHeader } from "./idempotency";

describe("deriveIdempotencyKey (the S3 declaration becomes mechanism)", () => {
  it("vendorKey: stable per run+step, so retries/resumes reuse the same key", () => {
    const s = { strategy: "vendorKey", header: "Idempotency-Key" } as const;
    expect(deriveIdempotencyKey(s, "run1", "step0", { a: 1 })).toBe("run1:step0");
    expect(deriveIdempotencyKey(s, "run1", "step0", { a: 999 })).toBe("run1:step0"); // input-independent
  });

  it("naturalKey: content-derived, so even a different run can't double-apply the same effect", () => {
    const s = { strategy: "naturalKey", key: (i: unknown) => `nat:${JSON.stringify(i)}` } as const;
    expect(deriveIdempotencyKey(s, "run1", "step0", { x: 1 })).toBe('nat:{"x":1}');
    expect(deriveIdempotencyKey(s, "run2", "stepZ", { x: 1 })).toBe('nat:{"x":1}'); // same content ⇒ same key
  });

  it("headers: vendorKey/naturalKey travel; dedupeWindow sends nothing (engine-enforced)", () => {
    expect(idempotencyHeader({ strategy: "vendorKey", header: "X-Idem" })).toBe("X-Idem");
    expect(idempotencyHeader({ strategy: "naturalKey", key: () => "k" })).toBe("Idempotency-Key");
    expect(idempotencyHeader({ strategy: "dedupeWindow", windowMs: 1000 })).toBeNull();
  });
});
