import type { FastifyInstance, FastifyRequest } from "fastify";
import { mountOAuth, applyChaos, type VendorState, type ChaosShapes } from "../kit";

/**
 * CalendarLite — a calendar vendor (S14), the target for the learner-authored connector. Auth:
 * `Authorization: Bearer`. Honors `Idempotency-Key` (so the learner's connector can use vendorKey).
 */
interface Event {
  id: string;
  title: string;
  start: string;
}

const shapes: ChaosShapes = {
  rateLimited: () => ({ error: "rate_limited" }),
  serverError: () => ({ error: "server_error" }),
};

export function calendarlite(app: FastifyInstance, state: VendorState): void {
  const events: Event[] = [];
  const idem = new Map<string, { id: string }>();
  mountOAuth(app, state);

  const auth = (req: FastifyRequest): boolean => {
    const h = req.headers["authorization"];
    const m = typeof h === "string" ? /^Bearer (.+)$/.exec(h) : null;
    return !!m && state.oauth.introspect(m[1]).active;
  };

  app.post("/events", async (req, reply) => {
    if (!(await applyChaos(state, reply, shapes))) return;
    if (!auth(req)) return reply.code(401).send({ error: "unauthorized" });
    const key = req.headers["idempotency-key"];
    if (typeof key === "string" && idem.has(key)) return reply.code(201).send(idem.get(key));
    const b = (req.body ?? {}) as Partial<Event>;
    const event: Event = { id: "evt_" + (events.length + 1), title: b.title ?? "", start: b.start ?? "" };
    events.push(event);
    const result = { id: event.id };
    if (typeof key === "string") idem.set(key, result);
    return reply.code(201).send(result);
  });

  app.get("/events", async (req, reply) => {
    if (!(await applyChaos(state, reply, shapes))) return;
    if (!auth(req)) return reply.code(401).send({ error: "unauthorized" });
    return reply.send({ events });
  });
}
