import { describe, it, expect } from "vitest";
import type { RelayDefinition } from "@relay/shared";
import { planRun, assertUpstreamOnly } from "./relay-plan";

const def: RelayDefinition = {
  trigger: { connector: "sheetlite", trigger: "row-created" },
  steps: [
    {
      id: "s0",
      connector: "mailpost",
      action: "send-email",
      config: { to: "{{trigger.values.email}}", subject: "Hi {{trigger.values.name}}", body: "welcome" },
    },
    {
      id: "s1",
      connector: "chatbox",
      action: "post-message",
      config: { channel: "general", text: "emailed {{steps.0.output.id}}" },
    },
  ],
};

describe("planRun (test-run resolution)", () => {
  it("resolves each step's config against trigger + prior outputs, in order", () => {
    const plan = planRun(
      def,
      { values: { email: "a@b.com", name: "Ada" } },
      [{ id: "em_1" }], // sample output for step 0
    );
    expect(plan[0].input).toEqual({ to: "a@b.com", subject: "Hi Ada", body: "welcome" });
    expect(plan[1].input).toEqual({ channel: "general", text: "emailed em_1" });
  });
});

describe("assertUpstreamOnly", () => {
  it("passes when steps reference only earlier steps", () => {
    expect(() => assertUpstreamOnly(def)).not.toThrow();
  });

  it("rejects a forward reference (defense beyond the UI picker)", () => {
    const bad: RelayDefinition = {
      trigger: def.trigger,
      steps: [
        { id: "s0", connector: "mailpost", action: "send-email", config: { to: "{{steps.1.output.id}}" } },
        { id: "s1", connector: "chatbox", action: "post-message", config: { text: "hi" } },
      ],
    };
    expect(() => assertUpstreamOnly(bad)).toThrow(/not upstream/);
  });
});
