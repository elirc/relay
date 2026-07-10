import type { FastifyInstance, FastifyRequest } from "fastify";
import { mountOAuth, applyChaos, type VendorState, type ChaosShapes } from "../kit";

/**
 * ChatBox — a team-chat vendor (Slack-shaped). Auth: `Authorization: Token <token>` (Token, not
 * Bearer!). Boolean-envelope responses: success is `{ ok: true, ... }`, failure is
 * `{ ok: false, error: "<code>" }` — with an HTTP 200 even on logical errors, the classic Slack
 * gotcha. This is the vendor that most punishes a client that only checks status codes.
 */
interface Message {
  ts: string;
  channel: string;
  text: string;
}

const shapes: ChaosShapes = {
  rateLimited: () => ({ ok: false, error: "rate_limited" }),
  serverError: () => ({ ok: false, error: "internal_error" }),
};

export function chatbox(app: FastifyInstance, state: VendorState): void {
  const messages: Message[] = [];
  let clock = 1_700_000_000;
  mountOAuth(app, state);

  const auth = (req: FastifyRequest): { accountId: string } | null => {
    const h = req.headers["authorization"];
    const m = typeof h === "string" ? /^Token (.+)$/.exec(h) : null;
    if (!m) return null;
    const i = state.oauth.introspect(m[1]);
    return i.active && i.accountId ? { accountId: i.accountId } : null;
  };

  app.post("/api/messages", async (req, reply) => {
    if (!(await applyChaos(state, reply, shapes))) return;
    // Note the Slack gotcha: auth failure is HTTP 200 with ok:false, not 401.
    if (!auth(req)) return reply.code(200).send({ ok: false, error: "not_authed" });
    const b = (req.body ?? {}) as { channel?: string; text?: string };
    const msg: Message = { ts: String(clock++), channel: b.channel ?? "general", text: b.text ?? "" };
    messages.push(msg);
    return reply.send({ ok: true, ts: msg.ts, channel: msg.channel });
  });

  app.get("/api/messages", async (req, reply) => {
    if (!(await applyChaos(state, reply, shapes))) return;
    if (!auth(req)) return reply.code(200).send({ ok: false, error: "not_authed" });
    const channel = (req.query as Record<string, string>).channel;
    const list = channel ? messages.filter((m) => m.channel === channel) : messages;
    return reply.send({ ok: true, messages: list });
  });
}
