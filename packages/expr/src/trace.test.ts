import { describe, it, expect } from "vitest";
import { renderWithTrace } from "./trace";

const scope = { trigger: { name: "Ada", email: "a@b.com" }, steps: [{ output: { id: "row_1" } }] };

describe("renderWithTrace (the killer debug feature)", () => {
  it("records what each {{ref}} resolved to", () => {
    const { output, trace } = renderWithTrace("Hi {{trigger.name}} <{{trigger.email}}>", scope);
    expect(output).toBe("Hi Ada <a@b.com>");
    expect(trace).toEqual([
      { ref: "trigger.name", value: "Ada" },
      { ref: "trigger.email", value: "a@b.com" },
    ]);
  });

  it("a missing ref traces as undefined instead of throwing — you're debugging, show the truth", () => {
    const { trace } = renderWithTrace("{{trigger.nope}}", scope);
    expect(trace[0]).toEqual({ ref: "trigger.nope", value: undefined });
  });
});
