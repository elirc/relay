import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "@relay/db";
import { VENDORS, VENDOR_META, type VendorName } from "@relay/vendor-farm";
import { requireSession } from "../auth";
import { authorizeUrl, exchangeCode } from "../oauth-client";
import { orgCipher } from "../secrets";
import { env } from "../env";

const STATE_COOKIE = "relay_oauth_state";
const isVendor = (v: string): v is VendorName => (VENDORS as readonly string[]).includes(v);

export async function connectionRoutes(app: FastifyInstance): Promise<void> {
  // List the org's connections WITH health — the surfaced state, so a dead connection is visible now.
  app.get("/api/connections", async (req, reply) => {
    const ctx = await requireSession(req, reply);
    if (!ctx) return;
    const conns = await prisma.connection.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
    });
    return conns.map((c) => ({
      id: c.id,
      vendor: c.vendor,
      status: c.status,
      scopes: c.scopes,
      expiresAt: c.expiresAt,
    }));
  });

  // Begin the OAuth flow. The `state` param defends against CSRF: we stash it in an httpOnly cookie and
  // require the callback to echo it. Present from the start — 🔗 Tracer S02 taught this via a planted
  // bug; here it's just correct, which is what learning looks like in git history.
  app.get<{ Params: { vendor: string } }>("/api/connections/:vendor/authorize", async (req, reply) => {
    const ctx = await requireSession(req, reply);
    if (!ctx) return;
    if (!isVendor(req.params.vendor)) {
      return reply.code(404).send({ error: { code: "UNKNOWN_VENDOR", message: req.params.vendor } });
    }
    const state = randomBytes(16).toString("hex");
    void reply.setCookie(STATE_COOKIE, `${req.params.vendor}:${state}`, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return reply.redirect(authorizeUrl(req.params.vendor, state));
  });

  // The vendor redirects back here with ?code&state. Verify state, exchange the code, and store the
  // tokens ENVELOPE-ENCRYPTED — plaintext tokens never touch the database.
  app.get("/api/connections/callback", async (req, reply) => {
    const ctx = await requireSession(req, reply);
    if (!ctx) return;
    const q = req.query as Record<string, string>;
    const cookie = req.cookies[STATE_COOKIE];
    if (!cookie || !q.state || !q.code) {
      return reply.code(400).send({ error: { code: "BAD_CALLBACK", message: "missing state/code" } });
    }
    const [vendor, expectedState] = cookie.split(":");
    if (q.state !== expectedState || !isVendor(vendor)) {
      return reply.code(400).send({ error: { code: "STATE_MISMATCH", message: "possible CSRF" } });
    }
    void reply.clearCookie(STATE_COOKIE, { path: "/" });

    const t = await exchangeCode(vendor, q.code);
    const cipher = await orgCipher(ctx.orgId);
    await prisma.connection.create({
      data: {
        orgId: ctx.orgId,
        vendor,
        scopes: t.scope ? t.scope.split(" ") : VENDOR_META[vendor].scopes,
        accessTokenEnc: cipher.seal(t.access_token),
        refreshTokenEnc: cipher.seal(t.refresh_token),
        expiresAt: new Date(Date.now() + t.expires_in * 1000),
        status: "healthy",
      },
    });
    return reply.redirect(`${env.WEB_URL}/connections?connected=${vendor}`);
  });
}
