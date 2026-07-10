import { describe, it, expect } from "vitest";
import { topoOrder, validateDag, linearToDag, type DagDefinition } from "./dag";
import type { RelayDefinition } from "./relay-def";

const diamond: DagDefinition = {
  // A → B, A → C, B → D, C → D  (D is a join)
  nodes: [
    { id: "A", type: "trigger" },
    { id: "B", type: "action" },
    { id: "C", type: "action" },
    { id: "D", type: "action" },
  ],
  edges: [
    { from: "A", to: "B" },
    { from: "A", to: "C" },
    { from: "B", to: "D" },
    { from: "C", to: "D" },
  ],
};

describe("topoOrder (Kahn)", () => {
  it("orders a diamond with the join last, and lists each node exactly once", () => {
    const order = topoOrder(diamond);
    expect(order).toHaveLength(4);
    expect(new Set(order).size).toBe(4); // each node once — the diamond-join fix
    expect(order[0]).toBe("A");
    expect(order[3]).toBe("D");
  });

  it("throws on a cycle", () => {
    const cyclic: DagDefinition = {
      nodes: [
        { id: "A", type: "trigger" },
        { id: "B", type: "action" },
      ],
      edges: [
        { from: "A", to: "B" },
        { from: "B", to: "A" }, // cycle
      ],
    };
    expect(() => topoOrder(cyclic)).toThrow(/cycle/);
  });
});

describe("validateDag", () => {
  it("accepts a valid diamond", () => {
    expect(validateDag(diamond).ok).toBe(true);
  });

  it("rejects a cycle, multiple sources, and unreachable nodes", () => {
    expect(validateDag({
      nodes: [{ id: "A", type: "trigger" }, { id: "B", type: "action" }],
      edges: [{ from: "A", to: "B" }, { from: "B", to: "A" }],
    }).errors.some((e) => /cycle/.test(e))).toBe(true);

    expect(validateDag({
      nodes: [{ id: "A", type: "trigger" }, { id: "X", type: "action" }],
      edges: [],
    }).errors.some((e) => /unreachable|single source/.test(e))).toBe(true);
  });

  it("rejects a forward (non-ancestor) reference", () => {
    const bad: DagDefinition = {
      nodes: [
        { id: "trigger", type: "trigger" },
        { id: "A", type: "action", config: { x: "{{B.output.id}}" } }, // B is downstream of A
        { id: "B", type: "action" },
      ],
      edges: [{ from: "trigger", to: "A" }, { from: "A", to: "B" }],
    };
    expect(bad && validateDag(bad).errors.some((e) => /not upstream/.test(e))).toBe(true);
  });
});

describe("linearToDag migration", () => {
  it("turns a linear relay into a straight-line DAG", () => {
    const def: RelayDefinition = {
      trigger: { connector: "sheetlite", trigger: "row-created" },
      steps: [
        { id: "s0", connector: "mailpost", action: "send-email", config: {} },
        { id: "s1", connector: "chatbox", action: "post-message", config: {} },
      ],
    };
    const dag = linearToDag(def);
    expect(dag.nodes.map((n) => n.id)).toEqual(["trigger", "s0", "s1"]);
    expect(dag.edges).toEqual([{ from: "trigger", to: "s0" }, { from: "s0", to: "s1" }]);
    expect(validateDag(dag).ok).toBe(true);
  });
});
