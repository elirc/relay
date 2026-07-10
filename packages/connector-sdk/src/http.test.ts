import { describe, it, expect } from "vitest";
import { makeHttp, cursorPaginer, type AuthScheme } from "./http";
import { ConnectorError } from "./errors";

const auth: AuthScheme = { type: "header", name: "authorization", format: (t) => `Bearer ${t}` };

/** Build a Response-like object for the fake fetch. */
function resp(
  status: number,
  body: unknown,
  opts: { retryAfter?: string; malformed?: boolean } = {},
): Response {
  return {
    status,
    headers: { get: (h: string) => (h.toLowerCase() === "retry-after" ? opts.retryAfter ?? null : null) },
    json: async () => {
      if (opts.malformed) throw new Error("Unexpected end of JSON input");
      return body;
    },
  } as unknown as Response;
}

const http = (fetchImpl: typeof fetch) =>
  makeHttp({ baseUrl: "https://vendor.test", auth, token: "tok", fetchImpl });

describe("http helper — error normalization (the closed taxonomy)", () => {
  it("returns the body on 2xx and injects the auth header", async () => {
    let seenAuth: string | undefined;
    const client = http(async (_url, init) => {
      seenAuth = (init?.headers as Record<string, string>)["authorization"];
      return resp(200, { ok: true });
    });
    const res = await client.request({ method: "GET", path: "/x" });
    expect(res.body).toEqual({ ok: true });
    expect(seenAuth).toBe("Bearer tok");
  });

  it("429 → RateLimited with Retry-After (retryable)", async () => {
    const client = http(async () => resp(429, {}, { retryAfter: "2" }));
    const err = await client.request({ method: "GET", path: "/x" }).catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.kind).toBe("RateLimited");
    expect(err.retryAfterMs).toBe(2000);
    expect(err.retryable).toBe(true);
  });

  it("401 → AuthFailed (NOT retryable)", async () => {
    const client = http(async () => resp(401, {}));
    const err = await client.request({ method: "GET", path: "/x" }).catch((e) => e);
    expect(err.kind).toBe("AuthFailed");
    expect(err.retryable).toBe(false);
  });

  it("503 → VendorDown (retryable)", async () => {
    const client = http(async () => resp(503, {}));
    const err = await client.request({ method: "GET", path: "/x" }).catch((e) => e);
    expect(err.kind).toBe("VendorDown");
  });

  it("200 with malformed JSON → VendorDown (the status lied)", async () => {
    const client = http(async () => resp(200, null, { malformed: true }));
    const err = await client.request({ method: "GET", path: "/x" }).catch((e) => e);
    expect(err.kind).toBe("VendorDown");
  });

  it("400 → BadInput (NOT retryable)", async () => {
    const client = http(async () => resp(400, { message: "nope" }));
    const err = await client.request({ method: "GET", path: "/x" }).catch((e) => e);
    expect(err.kind).toBe("BadInput");
  });
});

describe("pagination — one iterator over vendor paging styles", () => {
  it("cursor paging yields a flat stream across pages", async () => {
    const pages = [
      { rows: [1, 2], next_cursor: 2 },
      { rows: [3], next_cursor: null },
    ];
    let call = 0;
    const client = http(async () => resp(200, pages[call++]));
    const adapter = cursorPaginer<number>({ itemsKey: "rows", nextCursorKey: "next_cursor", cursorParam: "cursor" });

    const seen: number[] = [];
    for await (const n of client.paginate({ method: "GET", path: "/rows" }, adapter)) seen.push(n);
    expect(seen).toEqual([1, 2, 3]);
    expect(call).toBe(2);
  });
});
