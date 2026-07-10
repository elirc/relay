import { describe, it, expect } from "vitest";
import {
  arrayLen,
  arraySum,
  arraySlice,
  arrayJoin,
  arrayMapField,
  arrayFilterEq,
  MAX_COLLECTION_SIZE,
} from "./array-ops";

const rows = [
  { id: 1, name: "a" },
  { id: 2, name: "b" },
  { id: 3, name: "a" },
];

describe("array ops", () => {
  it("len / sum / slice / join", () => {
    expect(arrayLen(rows)).toBe(3);
    expect(arraySum([1, 2, 3])).toBe(6);
    expect(arraySlice([1, 2, 3, 4], 1, 3)).toEqual([2, 3]);
    expect(arrayJoin(["a", "b", "c"], "-")).toBe("a-b-c");
  });

  it("map to a field / filter by a field", () => {
    expect(arrayMapField(rows, "name")).toEqual(["a", "b", "a"]);
    expect(arrayFilterEq(rows, "name", "a")).toEqual([
      { id: 1, name: "a" },
      { id: 3, name: "a" },
    ]);
  });

  it("cost guard: an oversized collection throws — a map over it would DoS us", () => {
    const huge = new Array(MAX_COLLECTION_SIZE + 1).fill(0);
    expect(() => arrayLen(huge)).toThrow(/too large/);
  });
});
