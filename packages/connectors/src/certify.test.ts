import { describe, it, expect } from "vitest";
import { z } from "zod";
import { certifyConnector, type ConnectorDef } from "@relay/connector-sdk";
import { BUILTIN_CONNECTORS, calendarlite } from "./index";

describe("connector certification harness (the ecosystem gate)", () => {
  it("every built-in connector passes STRICT certification (dogfooding the gate on our own work)", () => {
    for (const c of BUILTIN_CONNECTORS) {
      const r = certifyConnector(c);
      expect(r.strictPass, `${c.key} failed: ${JSON.stringify(r.findings)}`).toBe(true);
    }
  });

  it("the learner-authored CalendarLite connector certifies (the practical exam)", () => {
    const r = certifyConnector(calendarlite);
    expect(r.strictPass).toBe(true);
    expect(r.findings).toEqual([]);
  });

  it("a SAFETY gap (no idempotency) fails and can't ship in ANY tier", () => {
    const bad = {
      key: "bad",
      name: "Bad",
      version: "1.0.0",
      auth: { type: "header", name: "authorization", format: (t: string) => t },
      basePath: "/bad",
      actions: [{ key: "a", name: "A", input: z.object({}), output: z.object({}), execute: async () => ({}) }],
      triggers: [],
    } as unknown as ConnectorDef;
    const r = certifyConnector(bad);
    expect(r.safetyPass).toBe(false);
    expect(r.findings.some((f) => f.severity === "safety" && f.check === "idempotency")).toBe(true);
  });

  it("a QUALITY gap (non-object input) fails strict but passes safety — the community tier", () => {
    const c = {
      ...calendarlite,
      actions: [{ ...calendarlite.actions[0], input: z.string() }],
    } as unknown as ConnectorDef;
    const r = certifyConnector(c);
    expect(r.strictPass).toBe(false); // not first-party quality
    expect(r.safetyPass).toBe(true); // but safe — the safety floor never lowers, quality is signaled
  });
});
