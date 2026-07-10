import { describe, it, expect } from "vitest";
import { runRelay, type EngineDeps, type HttpRequestInput } from "./engine-core";
import type { HttpStepDef } from "./run";

/** A fake vendor: records calls and returns a scripted response. No network, no infra. */
function fakeHttp(response: { status: number; body: unknown }, calls: HttpRequestInput[] = []) {
  return {
    calls,
    fn: async (input: HttpRequestInput) => {
      calls.push(input);
      return response;
    },
  };
}

function deps(httpRequest: EngineDeps["httpRequest"]): EngineDeps {
  let t = 1000;
  return { httpRequest, now: () => t++ };
}

const step: HttpStepDef = {
  id: "action-1",
  method: "POST",
  url: "https://vendor.example/notify",
  body: { hello: "world" },
};

describe("runRelay — the walking skeleton (S01)", () => {
  it("hook → run → one HTTP step executed → events recorded", async () => {
    const http = fakeHttp({ status: 200, body: { ok: true, id: "msg_1" } });
    const result = await runRelay([step], deps(http.fn));

    // the step actually called the vendor with our config
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]).toMatchObject({ method: "POST", url: "https://vendor.example/notify" });

    // terminal state
    expect(result.status).toBe("succeeded");
    expect(result.steps).toEqual([
      { stepId: "action-1", status: "succeeded", output: { ok: true, id: "msg_1" } },
    ]);

    // the append-only log tells the whole story, in order
    expect(result.events.map((e) => e.type)).toEqual([
      "run.created",
      "run.started",
      "step.started",
      "step.succeeded",
      "run.succeeded",
    ]);
    // seq is monotonic and 0-based
    expect(result.events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]);
  });

  it("a 5xx from the vendor fails the run fast — and there's nowhere to resume (the S07 gap)", async () => {
    const http = fakeHttp({ status: 503, body: "unavailable" });
    const result = await runRelay([step], deps(http.fn));

    expect(result.status).toBe("failed");
    expect(result.steps[0]).toMatchObject({ stepId: "action-1", status: "failed", error: "HTTP 503" });
    expect(result.events.map((e) => e.type)).toEqual([
      "run.created",
      "run.started",
      "step.started",
      "step.failed",
      "run.failed",
    ]);
    // NOTE: the naive engine gave up. No retry on a 503, no Retry-After honored. That omission is
    // the plot of Sprint 05 (in-PR arc) and Sprint 07 (durable engine).
  });

  it("fail-fast: a failing step stops the ones after it", async () => {
    const http = fakeHttp({ status: 500, body: "boom" });
    const second: HttpStepDef = { ...step, id: "action-2" };
    const result = await runRelay([step, second], deps(http.fn));

    expect(result.status).toBe("failed");
    expect(result.steps).toHaveLength(1); // action-2 never ran
    expect(http.calls).toHaveLength(1);
  });
});
