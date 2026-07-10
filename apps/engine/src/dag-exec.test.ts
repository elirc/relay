import { describe, it, expect } from "vitest";
import type { DagDefinition, DagNode } from "@relay/shared";
import { executeDagDfs, executeDagTopo, type DagExecDeps } from "./dag-exec";

const diamond: DagDefinition = {
  nodes: [
    { id: "trigger", type: "trigger" },
    { id: "B", type: "action" },
    { id: "C", type: "action" },
    { id: "D", type: "action" }, // the join
  ],
  edges: [
    { from: "trigger", to: "B" },
    { from: "trigger", to: "C" },
    { from: "B", to: "D" },
    { from: "C", to: "D" },
  ],
};

function counter(): { calls: string[]; deps: DagExecDeps } {
  const calls: string[] = [];
  return { calls, deps: { runNode: async (n: DagNode) => (calls.push(n.id), { id: n.id }) } };
}

describe("DAG executor — the dialogue (J vs S)", () => {
  it("[J] recursive DFS runs the diamond's join node TWICE (the bug)", async () => {
    const { calls, deps } = counter();
    await executeDagDfs(diamond, deps);
    expect(calls.filter((c) => c === "D")).toHaveLength(2); // D ran once per incoming path
  });

  it("[S] topological execution runs every node EXACTLY once (the fix)", async () => {
    const { calls, deps } = counter();
    await executeDagTopo(diamond, deps);
    expect(calls.filter((c) => c === "D")).toHaveLength(1);
    expect(new Set(calls).size).toBe(calls.length); // no node runs twice
  });

  it("[S] detects a cycle instead of hanging (the guard J lacked)", async () => {
    const cyclic: DagDefinition = {
      nodes: [
        { id: "trigger", type: "trigger" },
        { id: "A", type: "action" },
      ],
      edges: [
        { from: "trigger", to: "A" },
        { from: "A", to: "trigger" },
      ],
    };
    await expect(executeDagTopo(cyclic, counter().deps)).rejects.toThrow(/cycle/);
  });

  it("[S] a failing filter halts its downstream branch", async () => {
    const dag: DagDefinition = {
      nodes: [
        { id: "trigger", type: "trigger" },
        { id: "gate", type: "filter", condition: { op: "compare", left: "trigger.amount", cmp: "gt", right: 100 } },
        { id: "act", type: "action" },
      ],
      edges: [
        { from: "trigger", to: "gate" },
        { from: "gate", to: "act" },
      ],
    };
    const { calls, deps } = counter();
    // trigger output is { amount: 50 } → gate is false → act must NOT run
    deps.runNode = async (n) => (calls.push(n.id), n.id === "trigger" ? { amount: 50 } : { id: n.id });
    await executeDagTopo(dag, deps);
    expect(calls).not.toContain("act");
  });
});
