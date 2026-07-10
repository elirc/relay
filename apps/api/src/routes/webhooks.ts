import type { FastifyInstance } from "fastify";
import { prisma, Prisma } from "@relay/db";
import { enqueueRun } from "../queue";

const asJson = (v: unknown) => v as unknown as Prisma.InputJsonValue;

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Inbound managed-webhook receiver (S06). A vendor POSTs a trigger event to this binding's URL; we
   * turn it into a run pinned to the relay's published version. Truth first (the Run), then work (S01).
   */
  app.post<{ Params: { bindingId: string } }>("/hooks/t/:bindingId", async (req, reply) => {
    const binding = await prisma.triggerBinding.findUnique({
      where: { id: req.params.bindingId },
      include: {
        relay: {
          include: { versions: { where: { status: "published" }, orderBy: { version: "desc" }, take: 1 } },
        },
      },
    });
    if (!binding || !binding.active) {
      return reply.code(404).send({ error: { code: "NO_BINDING", message: "unknown binding" } });
    }
    const version = binding.relay.versions[0];
    if (!version) {
      return reply.code(409).send({ error: { code: "UNPUBLISHED", message: "relay not published" } });
    }

    const run = await prisma.run.create({
      data: {
        relayId: binding.relayId,
        versionId: version.id,
        status: "pending",
        trigger: asJson(req.body ?? {}),
      },
    });
    await enqueueRun(run.id);
    return reply.code(202).send({ runId: run.id });
  });
}
