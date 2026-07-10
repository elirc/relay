import { describe, it, expect } from "vitest";
import { evaluateCondition, ConditionSchema, type Condition } from "./condition";

const scope = { trigger: { amount: 120, status: "paid", tags: ["vip", "new"], email: "a@b.com" } };

describe("evaluateCondition (structured, no eval)", () => {
  it("comparisons resolve the left path and compare to a literal", () => {
    expect(evaluateCondition({ op: "compare", left: "trigger.amount", cmp: "gt", right: 100 }, scope)).toBe(true);
    expect(evaluateCondition({ op: "compare", left: "trigger.amount", cmp: "lt", right: 100 }, scope)).toBe(false);
    expect(evaluateCondition({ op: "compare", left: "trigger.status", cmp: "eq", right: "paid" }, scope)).toBe(true);
  });

  it("contains works on strings and arrays; exists checks presence", () => {
    expect(evaluateCondition({ op: "compare", left: "trigger.tags", cmp: "contains", right: "vip" }, scope)).toBe(true);
    expect(evaluateCondition({ op: "compare", left: "trigger.email", cmp: "contains", right: "@" }, scope)).toBe(true);
    expect(evaluateCondition({ op: "compare", left: "trigger.missing", cmp: "exists" }, scope)).toBe(false);
    expect(evaluateCondition({ op: "compare", left: "trigger.amount", cmp: "exists" }, scope)).toBe(true);
  });

  it("and / or / not combine", () => {
    const cond: Condition = {
      op: "and",
      conditions: [
        { op: "compare", left: "trigger.amount", cmp: "gte", right: 100 },
        { op: "or", conditions: [
          { op: "compare", left: "trigger.status", cmp: "eq", right: "paid" },
          { op: "compare", left: "trigger.status", cmp: "eq", right: "trialing" },
        ] },
        { op: "not", condition: { op: "compare", left: "trigger.status", cmp: "eq", right: "refunded" } },
      ],
    };
    expect(evaluateCondition(cond, scope)).toBe(true);
  });

  it("a missing path is falsey, never throws (conditions must be robust)", () => {
    expect(evaluateCondition({ op: "compare", left: "trigger.nope.deep", cmp: "eq", right: 1 }, scope)).toBe(false);
  });

  it("ConditionSchema validates a nested condition", () => {
    const parsed = ConditionSchema.parse({
      op: "and",
      conditions: [{ op: "compare", left: "trigger.amount", cmp: "gt", right: 0 }],
    });
    expect(parsed.op).toBe("and");
  });
});
