import { describe, it, expect } from "vitest";
import { MemoryObjectStore, shouldOffload, storeOutput, loadStoredOutput } from "./offload";

describe("payload offloading (flaw #2 harvest)", () => {
  it("keeps small outputs inline; sends large ones to object storage as a ref", async () => {
    const store = new MemoryObjectStore();
    const small = { id: "em_1", status: "queued" };
    const big = { blob: "x".repeat(100_000) };

    expect(shouldOffload(small)).toBe(false);
    expect(shouldOffload(big)).toBe(true);

    const s1 = await storeOutput(store, "run1:s0", small);
    const s2 = await storeOutput(store, "run1:s1", big);
    expect(s1).toEqual({ kind: "inline", value: small }); // the row keeps the value
    expect(s2.kind).toBe("ref"); // the row keeps only a ref; the bytes left Postgres
  });

  it("rehydrates both inline and ref outputs transparently", async () => {
    const store = new MemoryObjectStore();
    const big = { blob: "y".repeat(100_000) };
    const ref = await storeOutput(store, "k", big);
    expect(await loadStoredOutput(store, ref)).toEqual(big);

    const inline = await storeOutput(store, "k2", { a: 1 });
    expect(await loadStoredOutput(store, inline)).toEqual({ a: 1 });
  });
});
