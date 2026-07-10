import { describe, it, expect } from "vitest";
import { z, ZodObject } from "zod";
import { Registry, type ConnectorDef } from "@relay/connector-sdk";
import { buildRegistry, BUILTIN_CONNECTORS } from "./index";

/**
 * Contract tests — the SDK's real spec. An SDK without conformance tests is a suggestion. These are the
 * seed of S14's certification harness: the learner's connector must pass an expanded version of this.
 */
describe("connector contract", () => {
  const registry = buildRegistry();

  it("every registered action declares an idempotency strategy", () => {
    for (const c of registry.list()) {
      for (const a of c.actions) {
        expect(["vendorKey", "naturalKey", "dedupeWindow"]).toContain(a.idempotency.strategy);
      }
    }
  });

  it("every action input is an object schema (introspectable for UI forms)", () => {
    for (const c of BUILTIN_CONNECTORS) {
      for (const a of c.actions) {
        expect(a.input instanceof ZodObject).toBe(true);
      }
    }
  });

  it("registry metadata exposes fields + idempotency for the UI/API", () => {
    const meta = registry.metadata();
    const send = meta.find((m) => m.key === "mailpost")!.actions.find((a) => a.key === "send-email")!;
    expect(send.idempotency).toBe("vendorKey");
    expect(send.input.map((f) => f.name)).toEqual(["to", "subject", "body"]);
  });

  it("an action missing its idempotency declaration fails registration at boot", () => {
    const bad = {
      key: "broken",
      name: "Broken",
      auth: { type: "header", name: "authorization", format: (t: string) => t },
      basePath: "/broken",
      actions: [
        { key: "do", name: "Do", input: z.object({}), output: z.object({}), execute: async () => ({}) },
      ],
      triggers: [],
    } as unknown as ConnectorDef;
    expect(() => new Registry().register(bad)).toThrow(/idempotency/);
  });

  it("naturalKey idempotency is deterministic for the same input", () => {
    const addRow = BUILTIN_CONNECTORS.find((c) => c.key === "sheetlite")!.actions[0];
    if (addRow.idempotency.strategy !== "naturalKey") throw new Error("expected naturalKey");
    const input = { sheetId: "s1", values: { a: 1, b: 2 } };
    expect(addRow.idempotency.key(input)).toBe(addRow.idempotency.key({ ...input }));
  });
});
