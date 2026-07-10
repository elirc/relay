import { describe, it, expect } from "vitest";
import { makeRng, injectFailure, type FailureConfig } from "./chaos";

describe("deterministic chaos", () => {
  it("the same seed produces the same sequence (reproducible failure)", () => {
    const cfg: FailureConfig = { rate429: 0.3, rate5xx: 0.2, rateMalformed: 0.1 };
    const seqOf = (seed: number) =>
      Array.from({ length: 20 }, () => injectFailure(cfg, makeRng(seed)).kind).join(",");
    // NB: makeRng(seed) restarts the stream each call, so this checks determinism of the first draw.
    expect(seqOf(42)).toBe(seqOf(42));
  });

  it("a stream is deterministic across draws", () => {
    const cfg: FailureConfig = { rate429: 0.5 };
    const rngA = makeRng(7);
    const rngB = makeRng(7);
    const a = Array.from({ length: 50 }, () => injectFailure(cfg, rngA).kind);
    const b = Array.from({ length: 50 }, () => injectFailure(cfg, rngB).kind);
    expect(a).toEqual(b);
  });

  it("rate 1.0 always fires; rate 0 never fires", () => {
    const rng = makeRng(1);
    expect(injectFailure({ rate429: 1 }, rng).kind).toBe("429");
    const rng2 = makeRng(1);
    expect(injectFailure({}, rng2).kind).toBe("ok");
  });

  it("carries Retry-After only when configured (the nastier case omits it)", () => {
    const withHeader = injectFailure({ rate429: 1, retryAfterSec: 30 }, makeRng(1));
    const without = injectFailure({ rate429: 1 }, makeRng(1));
    expect(withHeader).toMatchObject({ kind: "429", retryAfterSec: 30 });
    expect(without).toMatchObject({ kind: "429" });
    expect((without as { retryAfterSec?: number }).retryAfterSec).toBeUndefined();
  });
});
