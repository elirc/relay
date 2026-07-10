import { randomBytes, createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma, type User } from "@relay/db";

export const SESSION_COOKIE = "relay_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

// We store only a SHA-256 of the session token. A DB leak yields hashes, not live session tokens.
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return token;
}

export interface SessionCtx {
  user: User;
  orgId: string;
}

export async function getSession(token: string | undefined): Promise<SessionCtx | null> {
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { memberships: true } } },
  });
  if (!s || s.expiresAt < new Date()) return null;
  const orgId = s.user.memberships[0]?.orgId;
  if (!orgId) return null;
  return { user: s.user, orgId };
}

/** Guard: resolve the session or 401. Returns null (and sends the response) when unauthenticated. */
export async function requireSession(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionCtx | null> {
  const ctx = await getSession(req.cookies[SESSION_COOKIE]);
  if (!ctx) {
    void reply.code(401).send({ error: { code: "UNAUTH", message: "sign in first" } });
    return null;
  }
  return ctx;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Dev login (compressed for S02): create-or-get a dev user + org and set a session cookie. Real
  // OAuth *login* (Relay's own auth) is out of scope this sprint — this sprint is about Relay being an
  // OAuth *client* to vendors, which is the harder, more interesting half.
  app.post("/auth/dev-login", async (_req, reply) => {
    const org = await prisma.organization.upsert({
      where: { id: "demo-org" },
      update: {},
      create: { id: "demo-org", name: "Demo Org" },
    });
    const user = await prisma.user.upsert({
      where: { email: "dev@relay.test" },
      update: {},
      create: { email: "dev@relay.test", name: "Dev User" },
    });
    await prisma.membership.upsert({
      where: { userId_orgId: { userId: user.id, orgId: org.id } },
      update: {},
      create: { userId: user.id, orgId: org.id, role: "ADMIN" },
    });
    const token = await createSession(user.id);
    void reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    return { user: { id: user.id, email: user.email, name: user.name }, orgId: org.id };
  });

  app.get("/auth/me", async (req, reply) => {
    const ctx = await getSession(req.cookies[SESSION_COOKIE]);
    if (!ctx) return reply.code(401).send({ error: { code: "UNAUTH", message: "not signed in" } });
    return { user: { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name }, orgId: ctx.orgId };
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    void reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });
}
