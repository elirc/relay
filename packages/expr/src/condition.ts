import { z } from "zod";
import { parsePath } from "./tokenizer";
import { resolvePath, type Scope } from "./render";

/**
 * Boolean conditions for branching/filter nodes (S08).
 *
 * Per the S08 debate, users author conditions through a **structured rule builder** (field / operator /
 * value), NOT by typing logic strings into our evaluator. That structure *compiles to* this small AST,
 * so there is exactly ONE execution path underneath and zero string-eval surface. Contrast S04's
 * expression language, which stayed paths-only precisely to avoid operators; here we add comparison and
 * boolean combinators, but as **data**, and each operator is a deliberate, reviewed addition (ADR-0010),
 * not `eval`.
 */
export type Comparator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists";

export type Condition =
  | { op: "and"; conditions: Condition[] }
  | { op: "or"; conditions: Condition[] }
  | { op: "not"; condition: Condition }
  | { op: "compare"; left: string; cmp: Comparator; right?: unknown };

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({ op: z.literal("and"), conditions: z.array(ConditionSchema) }),
    z.object({ op: z.literal("or"), conditions: z.array(ConditionSchema) }),
    z.object({ op: z.literal("not"), condition: ConditionSchema }),
    z.object({
      op: z.literal("compare"),
      left: z.string(),
      cmp: z.enum(["eq", "ne", "gt", "gte", "lt", "lte", "contains", "exists"]),
      right: z.unknown().optional(),
    }),
  ]),
);

/** Resolve a path, but a missing path yields `undefined` (conditions must be robust, not throw). */
function softResolve(path: string, scope: Scope): unknown {
  try {
    return resolvePath(parsePath(path), scope);
  } catch {
    return undefined;
  }
}

function compare(left: unknown, cmp: Comparator, right: unknown): boolean {
  switch (cmp) {
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "gt":
      return (left as number) > (right as number);
    case "gte":
      return (left as number) >= (right as number);
    case "lt":
      return (left as number) < (right as number);
    case "lte":
      return (left as number) <= (right as number);
    case "contains":
      if (typeof left === "string") return left.includes(String(right));
      if (Array.isArray(left)) return left.includes(right);
      return false;
    case "exists":
      return left !== undefined && left !== null;
  }
}

export function evaluateCondition(cond: Condition, scope: Scope): boolean {
  switch (cond.op) {
    case "and":
      return cond.conditions.every((c) => evaluateCondition(c, scope));
    case "or":
      return cond.conditions.some((c) => evaluateCondition(c, scope));
    case "not":
      return !evaluateCondition(cond.condition, scope);
    case "compare":
      return compare(softResolve(cond.left, scope), cond.cmp, cond.right);
  }
}
