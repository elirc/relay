import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildVendorFarm, DEV_CLIENTS } from "./index";

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

describe("vendor farm (in-process)", () => {
  it("MailPost: full OAuth code flow, then send an email with the Bearer token", async () => {
    app = buildVendorFarm();
    const c = DEV_CLIENTS.mailpost;

    // authorize -> 302 back to redirect_uri with ?code&state
    const authRes = await app.inject({
      method: "GET",
      url: `/mailpost/oauth/authorize?client_id=${c.clientId}&redirect_uri=${encodeURIComponent("https://app/cb")}&scope=email.send&state=xyz`,
    });
    expect(authRes.statusCode).toBe(302);
    const loc = new URL(authRes.headers.location as string);
    expect(loc.searchParams.get("state")).toBe("xyz");
    const code = loc.searchParams.get("code")!;

    // exchange the code
    const tokRes = await app.inject({
      method: "POST",
      url: "/mailpost/oauth/token",
      payload: {
        grant_type: "authorization_code",
        code,
        client_id: c.clientId,
        client_secret: c.clientSecret,
        redirect_uri: "https://app/cb",
      },
    });
    expect(tokRes.statusCode).toBe(200);
    const access = tokRes.json().access_token as string;

    // send an email with the token
    const sendRes = await app.inject({
      method: "POST",
      url: "/mailpost/v1/emails",
      headers: { authorization: `Bearer ${access}` },
      payload: { to: "a@b.com", subject: "hi", body: "yo" },
    });
    expect(sendRes.statusCode).toBe(202);
    expect(sendRes.json()).toMatchObject({ status: "queued" });
  });

  it("MailPost honors Idempotency-Key: the same key sends only ONE email (S07 arbiter)", async () => {
    app = buildVendorFarm();
    const c = DEV_CLIENTS.mailpost;
    const auth = await app.inject({
      method: "GET",
      url: `/mailpost/oauth/authorize?client_id=${c.clientId}&redirect_uri=${encodeURIComponent("https://app/cb")}&scope=email.send`,
    });
    const code = new URL(auth.headers.location as string).searchParams.get("code")!;
    const tok = await app.inject({
      method: "POST",
      url: "/mailpost/oauth/token",
      payload: { grant_type: "authorization_code", code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: "https://app/cb" },
    });
    const access = tok.json().access_token as string;
    const send = () =>
      app.inject({
        method: "POST",
        url: "/mailpost/v1/emails",
        headers: { authorization: `Bearer ${access}`, "idempotency-key": "run-1:step-0" },
        payload: { to: "a@b.com", subject: "hi", body: "yo" },
      });
    const first = await send();
    const second = await send(); // a retry/resume with the SAME key
    expect(first.json().id).toBe(second.json().id); // same result, no second email

    const list = await app.inject({
      method: "GET",
      url: "/mailpost/v1/emails",
      headers: { authorization: `Bearer ${access}` },
    });
    expect(list.json().data).toHaveLength(1);
  });

  it("ChatBox: missing auth returns HTTP 200 with ok:false (the Slack gotcha)", async () => {
    app = buildVendorFarm();
    const res = await app.inject({
      method: "POST",
      url: "/chatbox/api/messages",
      payload: { channel: "general", text: "hi" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: false, error: "not_authed" });
  });

  it("chaos: a malformed-JSON injection returns a 200 with an unparseable body", async () => {
    app = buildVendorFarm({ failure: { sheetlite: { rateMalformed: 1 } } });
    // authenticate first so we reach the resource handler
    const c = DEV_CLIENTS.sheetlite;
    const auth = await app.inject({
      method: "GET",
      url: `/sheetlite/oauth/authorize?client_id=${c.clientId}&redirect_uri=${encodeURIComponent("https://app/cb")}&scope=rows.read`,
    });
    const code = new URL(auth.headers.location as string).searchParams.get("code")!;
    const tok = await app.inject({
      method: "POST",
      url: "/sheetlite/oauth/token",
      payload: { grant_type: "authorization_code", code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: "https://app/cb" },
    });
    const access = tok.json().access_token as string;

    const res = await app.inject({
      method: "GET",
      url: "/sheetlite/rows",
      headers: { "x-sheetlite-key": access },
    });
    expect(res.statusCode).toBe(200);
    expect(() => JSON.parse(res.body)).toThrow(); // a status-code-only client would break here
  });
});
