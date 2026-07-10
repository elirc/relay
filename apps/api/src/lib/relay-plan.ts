import { render, tokenize, type Scope } from "@relay/expr";
import type { RelayDefinition } from "@relay/shared";

export interface ResolvedStep {
  id: string;
  connector: string;
  action: string;
  input: Record<string, unknown>;
}

/** Resolve one step's config: string values are treated as templates, everything else passes through. */
export function resolveStepConfig(
  config: Record<string, unknown>,
  scope: Scope,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    out[k] = typeof v === "string" ? render(v, scope) : v;
  }
  return out;
}

/**
 * Build the resolved plan for a test-run: resolve each step's config IN ORDER, threading prior step
 * outputs into scope. Because `scope.steps` only ever holds outputs for steps already processed, a
 * reference to a later step resolves to `undefined` and raises a render error — upstream-only validity
 * falls out of ordering. (We also enforce it statically; see `assertUpstreamOnly`.)
 */
export function planRun(
  def: RelayDefinition,
  trigger: unknown,
  sampleOutputs: unknown[] = [],
): ResolvedStep[] {
  const steps: unknown[] = [];
  const resolved: ResolvedStep[] = [];
  def.steps.forEach((step, i) => {
    const scope: Scope = { trigger, steps };
    resolved.push({
      id: step.id,
      connector: step.connector,
      action: step.action,
      input: resolveStepConfig(step.config, scope),
    });
    steps.push({ output: sampleOutputs[i] ?? {} });
  });
  return resolved;
}

/**
 * Static check (defense in a second layer, alongside the builder's picker): a step may only reference
 * steps BEFORE it. Reference validity is a graph property; enforcing it here means a hand-crafted API
 * payload can't smuggle a forward reference past the UI.
 */
export function assertUpstreamOnly(def: RelayDefinition): void {
  def.steps.forEach((step, i) => {
    for (const value of Object.values(step.config)) {
      if (typeof value !== "string") continue;
      for (const token of tokenize(value)) {
        if (token.kind !== "ref" || token.path[0] !== "steps") continue;
        const idx = Number(token.path[1]);
        if (Number.isInteger(idx) && idx >= i) {
          throw new Error(`step ${i} ("${step.id}") references steps.${idx}, which is not upstream`);
        }
      }
    }
  });
}
