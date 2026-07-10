import type { FastifyInstance } from "fastify";
import { prisma } from "@relay/db";

/**
 * Read models for the run-history UI (S01). History exists before the builder does — an automation
 * tool is only as good as its debugging surface, so we ship the "why did my run do that?" view first.
 */
export async function runRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/runs", async () => {
    const runs = await prisma.run.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { relay: true },
    });
    return runs.map((r) => ({
      id: r.id,
      relay: r.relay.name,
      status: r.status,
      createdAt: r.createdAt,
    }));
  });

  app.get<{ Params: { id: string } }>("/api/runs/:id", async (req, reply) => {
    const run = await prisma.run.findUnique({
      where: { id: req.params.id },
      include: {
        relay: true,
        steps: { orderBy: { createdAt: "asc" } },
        // events in seq order — the log reads as the story of the run
        events: { orderBy: { seq: "asc" } },
      },
    });
    if (!run) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "run not found" } });
    }
    return run;
  });
}
