import { describe, it, expect } from "vitest";
import { render } from "./render";
import { tokenize } from "./tokenizer";
import { ExprParseError, ExprRenderError } from "./errors";

const scope = {
  trigger: { email: "a@b.com", count: 5, items: [1, 2, 3], nested: { ok: true } },
  steps: [{ output: { id: "row_1" } }, { output: { name: "Ada" } }],
};

describe("grammar (closed, paths only)", () => {
  it("accepts dotted paths", () => {
    expect(tokenize("{{trigger.email}}").length).toBe(1);
    expect(tokenize("{{steps.1.output.name}}").length).toBe(1);
  });

  it("rejects operators, function calls, and arithmetic — the injection surface stays a path resolver", () => {
    expect(() => tokenize("{{1 + 2}}")).toThrow(ExprParseError);
    expect(() => tokenize("{{upper(name)}}")).toThrow(ExprParseError);
    expect(() => tokenize("{{a || b}}")).toThrow(ExprParseError);
    expect(() => tokenize("{{trigger.email; drop table}}")).toThrow(ExprParseError);
  });
});

describe("type preservation", () => {
  it("a whole-field ref keeps the value's type", () => {
    expect(render("{{trigger.count}}", scope)).toBe(5); // number, not "5"
    expect(render("{{trigger.items}}", scope)).toEqual([1, 2, 3]); // array, not "[object Object]"
    expect(render("{{trigger.nested}}", scope)).toEqual({ ok: true });
  });

  it("mixed text coerces to string", () => {
    expect(render("Count: {{trigger.count}}", scope)).toBe("Count: 5");
    expect(render("{{steps.1.output.name}} <{{trigger.email}}>", scope)).toBe("Ada <a@b.com>");
  });
});

describe("resolution", () => {
  it("resolves step outputs by index", () => {
    expect(render("{{steps.0.output.id}}", scope)).toBe("row_1");
  });

  it("a missing path is a render-time error, not a silent empty string", () => {
    expect(() => render("{{trigger.nope}}", scope)).toThrow(ExprRenderError);
    expect(() => render("{{steps.9.output.id}}", scope)).toThrow(ExprRenderError);
  });
});
