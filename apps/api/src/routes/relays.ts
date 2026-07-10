import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma, Prisma } from "@relay/db";
import { RelayDefinitionSchema, DagDefinitionSchema, validateDag } from "@relay/shared";
import { buildRegistry } from "@relay/connectors";
import { requireSession } from "../auth";
import { enqueueRun } from "../queue";
import { planRun, assertUpstreamOnly } from "../lib/relay-plan";

const asJson = (v: unknown) => v as unknown as Prisma.InputJsonValue;
const registry = buildRegistry();

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

    // A body with nodes+edges is a DAG (S08); otherwise it's the linear form, which we still accept.
    const raw = (req.body ?? {}) as Record<string, unknown>;
    let definition: unknown;
    if (Array.isArray(raw.nodes) && Array.isArray(raw.edges)) {
      const dag = DagDefinitionSchema.parse(raw);
      const v = validateDag(dag);
      // Validation at WRITE time (fast feedback) — a cycle submitted via raw API is rejected here with
      // 422, not discovered when the executor hangs. The topoOrder guard is the second layer at run time.
      if (!v.ok) return reply.code(422).send({ error: { code: "INVALID_DAG", message: v.errors.join("; ") } });
      definition = dag;
    } else {
      const linear = RelayDefinitionSchema.parse(raw);
      assertUpstreamOnly(linear); // second layer of defense, beyond the builder's picker
      definition = linear;
    }

    const relay = await prisma.relay.findFirst({
      where: { id: req.params.id, orgId: ctx.orgId },
      include: { versions: { orderBy: { version: "desc" } } },
    });
    if (!relay) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "relay" } });

    const existingDraft = relay.versions.find((v) => v.status === "draft");
    if (existingDraft) {
      return prisma.relayVersion.update({
        where: { id: existingDraft.id },
        data: { definition: asJson(definition) },
      });
    }
    const nextVersion = (relay.versions[0]?.version ?? 0) + 1;
    return reply.code(201).send(
      await prisma.relayVersion.create({
        data: { relayId: relay.id, version: nextVersion, definition: asJson(definition), status: "draft" },
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
    const published = await prisma.relayVersion.update({ where: { id: draft.id }, data: { status: "published" } });

    // Ensure a trigger binding exists for this relay's trigger (S06). A webhook binding gets a secret we
    // *would* verify inbound payloads against; a real deploy also registers a subscription on the vendor.
    try {
      const def = RelayDefinitionSchema.parse(draft.definition);
      const trig = registry.get(def.trigger.connector)?.triggers.find((t) => t.key === def.trigger.trigger);
      const existing = await prisma.triggerBinding.findFirst({
        where: { relayId: relay.id, connector: def.trigger.connector, triggerKey: def.trigger.trigger },
      });
      if (!existing) {
        await prisma.triggerBinding.create({
          data: {
            relayId: relay.id,
            kind: trig?.type ?? "webhook",
            connector: def.trigger.connector,
            triggerKey: def.trigger.trigger,
            webhookSecret: randomBytes(24).toString("hex"),
          },
        });
      }
    } catch {
      // A malformed draft definition simply skips binding creation; publish still succeeds.
    }
    return published;
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

  // Replay a historical run (S07). Default mode is **dry-run**: re-resolve the plan against the original
  // trigger, no side effects. `live` is a deliberate choice that clones the trigger into a fresh run and
  // enqueues it — replay that fires side effects by default would be a foot-gun cannon.
  app.post<{ Params: { runId: string } }>("/api/runs/:runId/replay", async (req, reply) => {
    const ctx = await requireSession(req, reply);
    if (!ctx) return;
    const src = await prisma.run.findFirst({
      where: { id: req.params.runId, relay: { orgId: ctx.orgId } },
    });
    if (!src) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "run" } });
    const body = (req.body ?? {}) as { mode?: string; versionId?: string };
    const mode = body.mode === "live" ? "live" : "dry-run";
    const versionId = body.versionId ?? src.versionId;
    if (!versionId) return reply.code(400).send({ error: { code: "NO_VERSION", message: "no version to replay" } });

    if (mode === "dry-run") {
      const version = await prisma.relayVersion.findUnique({ where: { id: versionId } });
      if (!version) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "version" } });
      const def = RelayDefinitionSchema.parse(version.definition);
      return { ok: true, mode, plan: planRun(def, src.trigger) };
    }
    const run = await prisma.run.create({
      data: { relayId: src.relayId, versionId, status: "pending", trigger: asJson(src.trigger) },
    });
    await enqueueRun(run.id);
    return reply.code(202).send({ ok: true, mode, runId: run.id });
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
