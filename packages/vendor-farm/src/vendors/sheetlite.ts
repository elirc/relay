import type { FastifyInstance, FastifyRequest } from "fastify";
import { mountOAuth, applyChaos, type VendorState, type ChaosShapes } from "../kit";

/**
 * SheetLite — a spreadsheet vendor. Auth: `X-SheetLite-Key: <token>` (NOT an Authorization header —
 * this is the kind of gratuitous difference real vendors ship). Cursor pagination (`?cursor&limit`).
 * Errors: `{ message, code }`. Its "row-created" webhook is the S06 trigger source.
 */
interface Row {
  id: string;
  values: Record<string, unknown>;
}

const shapes: ChaosShapes = {
  rateLimited: () => ({ message: "rate limited", code: "RATE_LIMITED" }),
  serverError: () => ({ message: "internal error", code: "INTERNAL" }),
};

export function sheetlite(app: FastifyInstance, state: VendorState): void {
  const rows: Row[] = [];
  mountOAuth(app, state);

  const auth = (req: FastifyRequest): { accountId: string } | null => {
    const token = req.headers["x-sheetlite-key"];
    if (typeof token !== "string") return null;
    const i = state.oauth.introspect(token);
    return i.active && i.accountId ? { accountId: i.accountId } : null;
  };
  const unauth = { message: "invalid or missing key", code: "UNAUTHORIZED" };

  app.post("/rows", async (req, reply) => {
    if (!(await applyChaos(state, reply, shapes))) return;
    if (!auth(req)) return reply.code(401).send(unauth);
    const b = (req.body ?? {}) as { values?: Record<string, unknown> };
    const row: Row = { id: "row_" + (rows.length + 1), values: b.values ?? {} };
    rows.push(row);
    return reply.code(201).send({ row });
  });

  app.get("/rows", async (req, reply) => {
    if (!(await applyChaos(state, reply, shapes))) return;
    if (!auth(req)) return reply.code(401).send(unauth);
    const q = req.query as Record<string, string>;
    const cursor = Math.max(0, Number(q.cursor ?? 0));
    const limit = Math.min(50, Math.max(1, Number(q.limit ?? 2)));
    const page = rows.slice(cursor, cursor + limit);
    const next = cursor + limit < rows.length ? cursor + limit : null;
    return reply.send({ rows: page, next_cursor: next });
  });
}
