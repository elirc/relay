import { describe, it, expect } from "vitest";
import { makeHttp, ConnectorError, type ConnectorContext, type ConnectorDef } from "@relay/connector-sdk";
import { mailpost, sheetlite } from "./index";

function resp(status: number, body: unknown, opts: { malformed?: boolean } = {}): Response {
  return {
    status,
    headers: { get: () => null },
    json: async () => {
      if (opts.malformed) throw new Error("bad json");
      return body;
    },
  } as unknown as Response;
}

function runAction(
  connector: ConnectorDef,
  actionKey: string,
  input: unknown,
  fetchImpl: typeof fetch,
  capture?: (init: RequestInit | undefined) => void,
): Promise<unknown> {
  const action = connector.actions.find((a) => a.key === actionKey)!;
  const wrapped: typeof fetch = async (url, init) => {
    capture?.(init);
    return fetchImpl(url, init);
  };
  const ctx: ConnectorContext = {
    connection: { id: "c1", vendor: connector.key, scopes: [] },
    http: makeHttp({ baseUrl: "https://farm" + connector.basePath, auth: connector.auth, token: "tok", fetchImpl: wrapped }),
    logger: { info: () => {} },
    idempotencyKey: "idem-1",
  };
  return action.execute(ctx, input);
}

describe("MailPost connector", () => {
  it("send-email happy path forwards the Idempotency-Key header (vendorKey)", async () => {
    let sentHeaders: Record<string, string> = {};
    const out = await runAction(
      mailpost,
      "send-email",
      { to: "a@b.com", subject: "hi", body: "yo" },
      async () => resp(202, { id: "em_1", status: "queued" }),
      (init) => (sentHeaders = init?.headers as Record<string, string>),
    );
    expect(out).toEqual({ id: "em_1", status: "queued" });
    expect(sentHeaders["Idempotency-Key"]).toBe("idem-1");
    expect(sentHeaders["authorization"]).toBe("Bearer tok");
  });

  it("429 → RateLimited, 200-malformed → VendorDown, 401 → AuthFailed", async () => {
    const input = { to: "a@b.com", subject: "hi", body: "yo" };
    const kindOf = async (fetchImpl: typeof fetch) =>
      runAction(mailpost, "send-email", input, fetchImpl).catch((e) => (e as ConnectorError).kind);

    expect(await kindOf(async () => resp(429, {}))).toBe("RateLimited");
    expect(await kindOf(async () => resp(200, null, { malformed: true }))).toBe("VendorDown");
    expect(await kindOf(async () => resp(401, {}))).toBe("AuthFailed");
  });
});

describe("SheetLite connector", () => {
  it("add-row happy path sends the X-SheetLite-Key auth header", async () => {
    let sentHeaders: Record<string, string> = {};
    const out = await runAction(
      sheetlite,
      "add-row",
      { sheetId: "s1", values: { name: "Ada" } },
      async () => resp(201, { row: { id: "row_1" } }),
      (init) => (sentHeaders = init?.headers as Record<string, string>),
    );
    expect(out).toEqual({ id: "row_1" });
    expect(sentHeaders["x-sheetlite-key"]).toBe("tok"); // identity format — vendor inconsistency, absorbed
  });
});
