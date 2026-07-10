import { z } from "zod";
import { ConditionSchema, tokenize, type Condition } from "@relay/expr";
import type { RelayDefinition } from "./relay-def";

/**
 * A relay is now a **graph** (S08): nodes (trigger, actions, filters) connected by edges. Conditional
 * paths and filters make it a real DAG, executed in topological order. The linear model (S04) becomes
 * a special case — a straight line — so existing relays migrate cleanly (`linearToDag`).
 */
export interface DagNode {
  id: string;
  type: "trigger" | "action" | "filter";
  connector?: string;
  action?: string;
  config?: Record<string, unknown>;
  condition?: Condition; // filter nodes: the branch continues only if this is true
}
export interface DagEdge {
  from: string;
  to: string;
}
export interface DagDefinition {
  nodes: DagNode[];
  edges: DagEdge[];
}

export const DagNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["trigger", "action", "filter"]),
  connector: z.string().optional(),
  action: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  condition: ConditionSchema.optional(),
});
export const DagDefinitionSchema = z.object({
  nodes: z.array(DagNodeSchema),
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
});

function adjacency(dag: DagDefinition): { adj: Map<string, string[]>; inDeg: Map<string, number> } {
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of dag.nodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
  }
  for (const e of dag.edges) {
    adj.get(e.from)?.push(e.to);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }
  return { adj, inDeg };
}

/**
 * Kahn's topological sort. Returns node ids in an order where every node follows its predecessors, and
 * — the property that matters — processes each node EXACTLY ONCE (so a diamond's join node runs once,
 * not once per incoming path). A node that never reaches in-degree 0 means a CYCLE, detected as a
 * natural side effect (the leftover count is nonzero).
 */
export function topoOrder(dag: DagDefinition): string[] {
  const { adj, inDeg } = adjacency(dag);
  const frontier = [...inDeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  while (frontier.length) {
    const id = frontier.shift() as string;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (inDeg.get(next) ?? 0) - 1;
      inDeg.set(next, d);
      if (d === 0) frontier.push(next);
    }
  }
  if (order.length !== dag.nodes.length) throw new Error("cycle detected: the graph is not acyclic");
  return order;
}

export interface DagValidation {
  ok: boolean;
  errors: string[];
}

/** Ancestors of `target` (nodes with a path TO it) — the only nodes it may reference. */
function ancestorsOf(dag: DagDefinition, target: string): Set<string> {
  const rev = new Map<string, string[]>();
  for (const n of dag.nodes) rev.set(n.id, []);
  for (const e of dag.edges) rev.get(e.to)?.push(e.from);
  const seen = new Set<string>();
  const stack = [...(rev.get(target) ?? [])];
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const p of rev.get(id) ?? []) stack.push(p);
  }
  return seen;
}

/**
 * Validate a DAG at publish time: edges reference real nodes, exactly one trigger source, acyclic, all
 * nodes reachable from the trigger, and references are upstream-only. Reference validity is a graph
 * property — a node may only read outputs of its ancestors, checked here (and the executor's checkpoints
 * enforce single execution, so the two layers cover write-time and run-time — defense in depth).
 */
export function validateDag(dag: DagDefinition): DagValidation {
  const errors: string[] = [];
  const ids = new Set(dag.nodes.map((n) => n.id));

  for (const e of dag.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) errors.push(`edge references unknown node: ${e.from} -> ${e.to}`);
  }

  const triggers = dag.nodes.filter((n) => n.type === "trigger");
  if (triggers.length !== 1) errors.push(`a relay must have exactly one trigger (found ${triggers.length})`);

  const { inDeg } = adjacency(dag);
  const sources = dag.nodes.filter((n) => (inDeg.get(n.id) ?? 0) === 0);
  if (sources.length !== 1) errors.push(`a relay must have a single source node (found ${sources.length})`);
  else if (sources[0].type !== "trigger") errors.push("the source node must be the trigger");

  let acyclic = true;
  try {
    topoOrder(dag);
  } catch {
    acyclic = false;
    errors.push("the graph contains a cycle");
  }

  if (triggers.length === 1 && acyclic) {
    // reachability from the trigger
    const adj = new Map<string, string[]>();
    for (const n of dag.nodes) adj.set(n.id, []);
    for (const e of dag.edges) adj.get(e.from)?.push(e.to);
    const reachable = new Set<string>();
    const stack = [triggers[0].id];
    while (stack.length) {
      const id = stack.pop() as string;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const nx of adj.get(id) ?? []) stack.push(nx);
    }
    for (const n of dag.nodes) if (!reachable.has(n.id)) errors.push(`node "${n.id}" is unreachable from the trigger`);

    // upstream-only references: a node's config/condition may reference only its ancestors
    for (const node of dag.nodes) {
      const ancestors = ancestorsOf(dag, node.id);
      for (const value of Object.values(node.config ?? {})) {
        if (typeof value !== "string") continue;
        for (const token of tokenize(value)) {
          if (token.kind !== "ref") continue;
          const head = token.path[0];
          if (ids.has(head) && head !== node.id && !ancestors.has(head)) {
            errors.push(`node "${node.id}" references "${head}", which is not upstream`);
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Migration: an old linear relay becomes a straight-line DAG (trigger → step0 → step1 → …). */
export function linearToDag(def: RelayDefinition): DagDefinition {
  const nodes: DagNode[] = [
    { id: "trigger", type: "trigger", connector: def.trigger.connector, action: def.trigger.trigger },
  ];
  const edges: DagEdge[] = [];
  let prev = "trigger";
  for (const step of def.steps) {
    nodes.push({ id: step.id, type: "action", connector: step.connector, action: step.action, config: step.config });
    edges.push({ from: prev, to: step.id });
    prev = step.id;
  }
  return { nodes, edges };
}
