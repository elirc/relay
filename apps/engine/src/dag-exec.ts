import { topoOrder, type DagDefinition, type DagNode } from "@relay/shared";
import { evaluateCondition } from "@relay/expr";

export interface DagExecDeps {
  /** run one node (its side effect); returns the node's output */
  runNode: (node: DagNode, scope: Record<string, unknown>) => Promise<unknown>;
  /** checkpoint check (S07): a completed node is skipped and rehydrated */
  isCompleted?: (nodeId: string) => boolean;
  loadOutput?: (nodeId: string) => unknown;
}

function childMap(dag: DagDefinition): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of dag.nodes) adj.set(n.id, []);
  for (const e of dag.edges) adj.get(e.from)?.push(e.to);
  return adj;
}

/**
 * [J — learner] Recursive depth-first from the source. Works on lines and trees; but it has NO
 * visited-set, so on a DIAMOND (A→B, A→C, B→D, C→D) it runs the join node D once PER incoming path —
 * twice — and on a CYCLE it recurses forever. Kept as the failing oracle that motivates the rewrite.
 */
export async function executeDagDfs(dag: DagDefinition, deps: DagExecDeps): Promise<Record<string, unknown>> {
  const adj = childMap(dag);
  const outputs: Record<string, unknown> = {};
  const source = dag.nodes.find((n) => n.type === "trigger");
  if (!source) throw new Error("no trigger node");

  async function visit(id: string): Promise<void> {
    const node = dag.nodes.find((n) => n.id === id);
    if (!node) return;
    outputs[id] = await deps.runNode(node, { trigger: outputs["trigger"], ...outputs });
    for (const next of adj.get(id) ?? []) await visit(next); // no visited set → revisits + cycles
  }
  await visit(source.id);
  return outputs;
}

/**
 * [S — reviewed] Topological order + per-node execution. Kahn's algorithm already guarantees each node
 * runs EXACTLY ONCE (so the diamond join runs once) and DETECTS cycles (topoOrder throws). Filter nodes
 * evaluate their condition and, if false, HALT their downstream branch. Checkpointed nodes (S07) are
 * skipped and rehydrated — good foundations: the "run only if not already done" rule from the durable
 * engine is the same rule that makes joins correct here.
 */
export async function executeDagTopo(dag: DagDefinition, deps: DagExecDeps): Promise<Record<string, unknown>> {
  const order = topoOrder(dag); // throws on cycle — the guard J lacked
  const preds = new Map<string, string[]>();
  for (const n of dag.nodes) preds.set(n.id, []);
  for (const e of dag.edges) preds.get(e.to)?.push(e.from);

  const outputs: Record<string, unknown> = {};
  const halted = new Set<string>();

  for (const id of order) {
    const node = dag.nodes.find((n) => n.id === id);
    if (!node) continue;

    // A non-trigger node runs only if reachable via at least one NON-halted predecessor. If every path
    // into it was cut by a filter, it (and its subtree) is halted too.
    const parents = preds.get(id) ?? [];
    if (node.type !== "trigger" && (parents.length === 0 || parents.every((p) => halted.has(p)))) {
      halted.add(id);
      continue;
    }

    if (deps.isCompleted?.(id)) {
      outputs[id] = deps.loadOutput?.(id);
      continue;
    }

    const scope = { trigger: outputs["trigger"], ...outputs };
    if (node.type === "filter") {
      const pass = node.condition ? evaluateCondition(node.condition, scope) : true;
      outputs[id] = { pass };
      if (!pass) halted.add(id); // cut this branch — downstream nodes won't run
      continue;
    }

    outputs[id] = await deps.runNode(node, scope);
  }
  return outputs;
}
