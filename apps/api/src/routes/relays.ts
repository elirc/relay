import type { FastifyInstance } from "fastify";
import { prisma, Prisma } from "@relay/db";
import { RelayDefinitionSchema } from "@relay/shared";
import { requireSession } from "../auth";
import { enqueueRun } from "../queue";
import { planRun, assertUpstreamOnly } from "../lib/relay-plan";

const asJson = (v: unknown) => v as unknown as Prisma.InputJsonValue;

export async function relayRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/relays", async (req, reply) => {
    const ctx = await requireSession(req, reply);
    if (!ctx) return;
    const relays = await prisma.relay.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    return relays.map((r) => ({
      id: r.id,
      name: r.name,
      latest: r.versions[0] ? { version: r.versions[0].version, status: r.versions[0].status } : null,
    }));
  });

  app.post("/api/relays", async (req, reply) => {
    const ctx = await requireSession(req, reply);
    if (!ctx) return;
    const { name } = (req.body ?? {}) as { name?: string };
    if (!name?.trim()) return reply.code(400).send({ error: { code: "BAD", message: "name required" } });
    const relay = await prisma.relay.create({ data: { orgId: ctx.orgId, name: name.trim() } });
    return reply.code(201).send({ id: relay.id, name: relay.name });
  });

  app.get<{ Params: { id: string } }>("/api/relays/:id", async (req, reply) => {
    const ctx = await requireSession(req, reply);
    if (!ctx) return;
    const relay = await prisma.relay.findFirst({
      where: { id: req.params.id, orgId: ctx.orgId },
      include: { versions: { orderBy: { version: "desc" } } },
    });
    if (!relay) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "relay" } });
    return relay;
  });

  // Save the DRAFT. Drafts are mutable; published versions are immutable, so editing a published relay
  // creates the NEXT draft rather than mutating history.
  app.put<{ Params: { id: string } }>("/api/relays/:id/draft", async (req, reply) => {
    const ctx = await requireSession(req, reply);
    if (!ctx) return;
    const def = RelayDefinitionSchema.parse(req.body);
    assertUpstreamOnly(def); // second layer of defense, beyond the builder's picker
    const relay = await prisma.relay.findFirst({
      where: { id: req.params.id, orgId: ctx.orgId },
      include: { versions: { orderBy: { version: "desc" } } },
    });
    if (!relay) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "relay" } });

    const existingDraft = relay.versions.find((v) => v.status === "draft");
    if (existingDraft) {
      return prisma.relayVersion.update({
        where: { id: existingDraft.id },
        data: { definition: asJson(def) },
      });
    }
    const nextVersion = (relay.versions[0]?.version ?? 0) + 1;
    return reply.code(201).send(
      await prisma.relayVersion.create({
        data: { relayId: relay.id, version: nextVersion, definition: asJson(def), status: "draft" },
      }),
    );
  });

  app.post<{ Params: { id: string } }>("/api/relays/:id/publish", async (req, reply) => {
    const ctx = await requireSession(req, reply);
    if (!ctx) return;
    const relay = await prisma.relay.findFirst({
      where: { id: req.params.id, orgId: ctx.orgId },
      include: { versions: { orderBy: { version: "desc" } } },
    });
    if (!relay) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "relay" } });
    const draft = relay.versions.find((v) => v.status === "draft");
    if (!draft) return reply.code(400).send({ error: { code: "NO_DRAFT", message: "nothing to publish" } });
    return prisma.relayVersion.update({ where: { id: draft.id }, data: { status: "published" } });
  });

  // Run now: create a real Run pinned to the published version and enqueue it (a manual trigger until
  // real webhook/polling triggers arrive in S06). Truth first (the Run), then work (the job) — S01's rule.
  app.post<{ Params: { id: string } }>("/api/relays/:id/run", async (req, reply) => {
    const ctx = await requireSession(req, reply);
    if (!ctx) return;
    const relay = await prisma.relay.findFirst({
      where: { id: req.params.id, orgId: ctx.orgId },
      include: { versions: { where: { status: "published" }, orderBy: { version: "desc" }, take: 1 } },
    });
    if (!relay?.versions[0]) {
      return reply.code(400).send({ error: { code: "NOT_PUBLISHED", message: "publish the relay first" } });
    }
    const trigger = (req.body as { trigger?: unknown })?.trigger ?? {};
    const run = await prisma.run.create({
      data: { relayId: relay.id, versionId: relay.versions[0].id, status: "pending", trigger: asJson(trigger) },
    });
    await enqueueRun(run.id);
    return reply.code(202).send({ runId: run.id, status: run.status });
  });

  // Test-run: resolve the latest version's templates against sample trigger data. No real side effects —
  // it surfaces mapping mistakes (missing/forward refs) BEFORE the relay goes live.
  app.post<{ Params: { id: string } }>("/api/relays/:id/test-run", async (req, reply) => {
    const ctx = await requireSession(req, reply);
    if (!ctx) return;
    const relay = await prisma.relay.findFirst({
      where: { id: req.params.id, orgId: ctx.orgId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!relay?.versions[0]) {
      return reply.code(400).send({ error: { code: "NO_VERSION", message: "build the relay first" } });
    }
    const def = RelayDefinitionSchema.parse(relay.versions[0].definition);
    const sample = (req.body as { trigger?: unknown })?.trigger ?? {};
    try {
      return { ok: true, plan: planRun(def, sample) };
    } catch (err) {
      return reply.code(422).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
