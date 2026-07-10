import type { FastifyInstance, FastifyRequest } from "fastify";
import { mountOAuth, applyChaos, type VendorState, type ChaosShapes } from "../kit";

/**
 * MailPost — a transactional email vendor. Auth: `Authorization: Bearer <token>`. Page-number
 * pagination. Errors: `{ error: { type, message } }`. (Compare SheetLite and ChatBox — none of these
 * three agree, on purpose.)
 */
interface Email {
  id: string;
  to: string;
  subject: string;
  body: string;
  status: string;
}

const shapes: ChaosShapes = {
  rateLimited: () => ({ error: { type: "rate_limit", message: "Too many requests" } }),
  serverError: () => ({ error: { type: "server_error", message: "Internal error" } }),
};

export function mailpost(app: FastifyInstance, state: VendorState): void {
  const emails: Email[] = [];
  // Idempotency store (S07): a repeated Idempotency-Key returns the SAME result without sending again.
  // This is what makes MailPost the arbiter that closes the engine's crash window.
  const idem = new Map<string, { id: string; status: string }>();
  mountOAuth(app, state);

  const auth = (req: FastifyRequest): { accountId: string } | null => {
    const h = req.headers["authorization"];
    const m = typeof h === "string" ? /^Bearer (.+)$/.exec(h) : null;
    if (!m) return null;
    const i = state.oauth.introspect(m[1]);
    return i.active && i.accountId ? { accountId: i.accountId } : null;
  };
  const unauth = { error: { type: "auth", message: "invalid or missing token" } };

  app.post("/v1/emails", async (req, reply) => {
    if (!(await applyChaos(state, reply, shapes))) return;
    if (!auth(req)) return reply.code(401).send(unauth);
    const key = req.headers["idempotency-key"];
    if (typeof key === "string" && idem.has(key)) {
      return reply.code(202).send(idem.get(key)); // seen this key — no second email
    }
    const b = (req.body ?? {}) as Partial<Email>;
    const email: Email = {
      id: "em_" + (emails.length + 1),
      to: b.to ?? "",
      subject: b.subject ?? "",
      body: b.body ?? "",
      status: "queued",
    };
    emails.push(email);
    const result = { id: email.id, status: email.status };
    if (typeof key === "string") idem.set(key, result);
    return reply.code(202).send(result);
  });

  app.get("/v1/emails", async (req, reply) => {
    if (!(await applyChaos(state, reply, shapes))) return;
    if (!auth(req)) return reply.code(401).send(unauth);
    const page = Math.max(1, Number((req.query as Record<string, string>).page ?? 1));
    const size = 2;
    const start = (page - 1) * size;
    const data = emails.slice(start, start + size);
    return reply.send({ data, page, has_more: start + size < emails.length });
  });
}
