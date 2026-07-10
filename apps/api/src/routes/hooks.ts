import type { FastifyInstance } from "fastify";
import { prisma, Prisma } from "@relay/db";
import { DemoWebhookPayloadSchema } from "@relay/shared";
import { enqueueRun } from "../queue";

// S01 wires the whole relay in code; the demo relay is seeded with this id.
const DEMO_RELAY_ID = "demo-relay";

export async function hookRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The inbound trigger. Two writes, and their ORDER is the lesson:
   *   1. create the Run in Postgres (truth) — durable the instant we accept the webhook
   *   2. enqueue a job in Redis (work) — a pointer that says "go execute run X"
   * Truth first, then work. If the enqueue fails, the Run sits in `pending` and a sweeper can
   * re-enqueue it (S06). If we'd done it the other way, a job could reference a Run that was never
   * saved. We return 202 (Accepted): the run is recorded, execution happens asynchronously.
   */
  app.post("/hooks/demo", async (req, reply) => {
    const payload = DemoWebhookPayloadSchema.parse(req.body ?? {});
    const run = await prisma.run.create({
      data: {
        relayId: DEMO_RELAY_ID,
        status: "pending",
        trigger: payload as unknown as Prisma.InputJsonValue,
      },
    });
    await enqueueRun(run.id);
    return reply.code(202).send({ runId: run.id, status: run.status });
  });
}
