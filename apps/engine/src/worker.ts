import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { prisma, Prisma, type Connection } from "@relay/db";
import {
  RelayDefinitionSchema,
  DagDefinitionSchema,
  redactSecrets,
  runRelay,
  type DagDefinition,
  type EngineDeps,
  type HttpRequestFn,
  type HttpStepDef,
} from "@relay/shared";
import { render } from "@relay/expr";
import { buildRegistry } from "@relay/connectors";
import { makeHttp } from "@relay/connector-sdk";
import { executeRun, type ExecDeps, type StepInput } from "./executor";
import { executeDagTopo } from "./dag-exec";
import { deriveIdempotencyKey } from "./idempotency";
import { orgCipher } from "./secrets";
import { env } from "./env";

const RUN_QUEUE = "relay:runs";
const registry = buildRegistry();

const asJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === undefined || v === null ? undefined : (v as Prisma.InputJsonValue);

// ── Legacy S01 demo path (versionless runs) ─────────────────────────────────────────────────────
const httpRequest: HttpRequestFn = async ({ method, url, headers, body }) => {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
  });
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    parsed = await res.text().catch(() => null);
  }
  return { status: res.status, body: parsed };
};

async function executeLegacyDemo(runId: string): Promise<void> {
  const deps: EngineDeps = { httpRequest, now: () => Date.now() };
  const steps: HttpStepDef[] = [{ id: "notify", method: "GET", url: env.DEMO_ACTION_URL }];
  const result = await runRelay(steps, deps);
  await prisma.$transaction([
    ...result.events.map((e) =>
      prisma.runEvent.create({
        data: { runId, seq: e.seq, type: e.type, stepId: e.stepId, data: asJson(e.data), at: new Date(e.at) },
      }),
    ),
    ...result.steps.map((s) =>
      prisma.stepRun.upsert({
        where: { runId_stepId: { runId, stepId: s.stepId } },
        create: { runId, stepId: s.stepId, status: s.status, output: asJson(s.output), error: s.error },
        update: { status: s.status, output: asJson(s.output), error: s.error },
      }),
    ),
  ]);
}

// ── Engine v1 (S05): execute a published, versioned relay ───────────────────────────────────────
async function executeVersioned(
  runId: string,
  orgId: string,
  trigger: unknown,
  steps: StepInput[],
  connections: Connection[],
): Promise<void> {
  const byVendor = new Map(connections.map((c) => [c.vendor, c]));
  const cipher = await orgCipher(orgId);
  const usedSecrets = new Set<string>(); // plaintext tokens seen this run, for redaction
  const stepKeys = new Map<string, string>(); // stepId -> derived idempotency key (for the checkpoint)

  // Incremental, seq-ordered event log (the S05 improvement over S01's persist-at-end). Fire-and-forget
  // so emit stays synchronous; seq is assigned in order, so `order by seq` reads correctly.
  let seq = await prisma.runEvent.count({ where: { runId } });
  const emit: ExecDeps["emit"] = (type, data) => {
    const stepId = typeof data?.stepId === "string" ? data.stepId : null;
    void prisma.runEvent
      .create({ data: { runId, seq: seq++, type, stepId, data: asJson(data) } })
      .catch(() => {});
  };

  const deps: ExecDeps = {
    renderConfig: (config, scope) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(config)) out[k] = typeof v === "string" ? render(v, scope) : v;
      return out;
    },
    runAction: async (step, input) => {
      const connector = registry.get(step.connector);
      const action = connector?.actions.find((a) => a.key === step.action);
      if (!connector || !action) throw new Error(`unknown action ${step.connector}.${step.action}`);
      const conn = byVendor.get(step.connector);
      if (!conn?.accessTokenEnc) throw new Error(`no healthy connection for ${step.connector}`);
      const token = cipher.open(conn.accessTokenEnc);
      usedSecrets.add(token);
      const http = makeHttp({
        baseUrl: env.VENDOR_FARM_URL + connector.basePath,
        auth: connector.auth,
        token,
      });
      const parsed = action.input.parse(input); // validate AFTER render (expressions produce the input)
      // Derive the idempotency key from the connector's DECLARED strategy (S07). Stable across retries
      // AND resumes, so the vendor (vendorKey/naturalKey) recognizes a repeat and doesn't act twice.
      const key = deriveIdempotencyKey(action.idempotency, runId, step.id, parsed);
      stepKeys.set(step.id, key);
      return action.execute(
        {
          connection: { id: conn.id, vendor: conn.vendor, scopes: conn.scopes },
          http,
          logger: { info: () => {} },
          idempotencyKey: key,
        },
        parsed,
      );
    },
    persistStep: async (_index, step, output) => {
      const safe = redactSecrets(output, [...usedSecrets]); // tokens never land in history
      const key = stepKeys.get(step.id);
      // Commit the checkpoint: SUCCEEDED + the key + committedAt. A resume that finds this never re-runs.
      await prisma.stepRun.upsert({
        where: { runId_stepId: { runId, stepId: step.id } },
        create: { runId, stepId: step.id, status: "succeeded", output: asJson(safe), idempotencyKey: key, committedAt: new Date() },
        update: { status: "succeeded", output: asJson(safe), error: null, idempotencyKey: key, committedAt: new Date() },
      });
    },
    loadPersistedOutput: async (index) => {
      const sr = await prisma.stepRun.findUnique({
        where: { runId_stepId: { runId, stepId: steps[index].id } },
      });
      return sr?.output ?? {};
    },
    emit,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };

  // Resume: any step already persisted as succeeded is skipped (narrows the crash window — S05 partial
  // fix; the full checkpoint + idempotency close is S07).
  const done = await prisma.stepRun.findMany({ where: { runId, status: "succeeded" }, select: { stepId: true } });
  const doneIds = new Set(done.map((d) => d.stepId));
  const completed = new Set<number>();
  steps.forEach((s, i) => {
    if (doneIds.has(s.id)) completed.add(i);
  });

  emit("run.started");
  await executeRun(steps, trigger, deps, completed);
  emit("run.succeeded");
}

// ── Engine v3 (S08): execute a DAG relay in topological order ────────────────────────────────────
async function executeDagVersioned(
  runId: string,
  orgId: string,
  trigger: unknown,
  dag: DagDefinition,
  connections: Connection[],
): Promise<void> {
  const byVendor = new Map(connections.map((c) => [c.vendor, c]));
  const cipher = await orgCipher(orgId);
  const usedSecrets = new Set<string>();
  let seq = await prisma.runEvent.count({ where: { runId } });
  const emit = (type: string, data?: Record<string, unknown>) => {
    const stepId = typeof data?.stepId === "string" ? data.stepId : null;
    void prisma.runEvent.create({ data: { runId, seq: seq++, type, stepId, data: asJson(data) } }).catch(() => {});
  };

  const done = await prisma.stepRun.findMany({ where: { runId, status: "succeeded" }, select: { stepId: true, output: true } });
  const doneOutputs = new Map(done.map((d) => [d.stepId, d.output]));

  emit("run.started");
  await executeDagTopo(dag, {
    isCompleted: (id) => doneOutputs.has(id),
    loadOutput: (id) => doneOutputs.get(id),
    runNode: async (node, scope) => {
      if (node.type === "trigger") return trigger; // the trigger node's "output" is the payload
      const connector = registry.get(node.connector ?? "");
      const action = connector?.actions.find((a) => a.key === node.action);
      if (!connector || !action) throw new Error(`unknown action ${node.connector}.${node.action}`);
      const conn = byVendor.get(node.connector ?? "");
      if (!conn?.accessTokenEnc) throw new Error(`no healthy connection for ${node.connector}`);
      const token = cipher.open(conn.accessTokenEnc);
      usedSecrets.add(token);
      const http = makeHttp({ baseUrl: env.VENDOR_FARM_URL + connector.basePath, auth: connector.auth, token });
      const input: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node.config ?? {})) input[k] = typeof v === "string" ? render(v, scope) : v;
      const parsed = action.input.parse(input);
      const key = deriveIdempotencyKey(action.idempotency, runId, node.id, parsed);
      const out = await action.execute(
        { connection: { id: conn.id, vendor: conn.vendor, scopes: conn.scopes }, http, logger: { info: () => {} }, idempotencyKey: key },
        parsed,
      );
      const safe = redactSecrets(out, [...usedSecrets]);
      await prisma.stepRun.upsert({
        where: { runId_stepId: { runId, stepId: node.id } },
        create: { runId, stepId: node.id, status: "succeeded", output: asJson(safe), idempotencyKey: key, committedAt: new Date() },
        update: { status: "succeeded", output: asJson(safe), error: null, idempotencyKey: key, committedAt: new Date() },
      });
      emit("step.succeeded", { stepId: node.id });
      return out;
    },
  });
  emit("run.succeeded");
}

function isDag(def: unknown): boolean {
  return typeof def === "object" && def !== null && Array.isArray((def as { nodes?: unknown }).nodes);
}

async function execute(job: Job<{ runId: string }>): Promise<void> {
  const { runId } = job.data;
  const run = await prisma.run.findUnique({ where: { id: runId }, include: { version: true, relay: true } });
  if (!run) return;
  await prisma.run.update({
    where: { id: runId },
    data: { status: "running", startedAt: run.startedAt ?? new Date() },
  });
  try {
    if (run.versionId && run.version) {
      const connections = await prisma.connection.findMany({ where: { orgId: run.relay.orgId } });
      if (isDag(run.version.definition)) {
        const dag = DagDefinitionSchema.parse(run.version.definition);
        await executeDagVersioned(runId, run.relay.orgId, run.trigger, dag, connections);
      } else {
        const def = RelayDefinitionSchema.parse(run.version.definition);
        await executeVersioned(runId, run.relay.orgId, run.trigger, def.steps, connections);
      }
    } else {
      await executeLegacyDemo(runId);
    }
    await prisma.run.update({ where: { id: runId }, data: { status: "succeeded", finishedAt: new Date() } });
  } catch (err) {
    await prisma.run.update({ where: { id: runId }, data: { status: "failed", finishedAt: new Date() } });
    throw err; // surface to BullMQ; a retried delivery resumes from the last persisted step
  }
}

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const worker = new Worker(RUN_QUEUE, execute, { connection });
worker.on("completed", (job) => console.log(`engine: run ${job.data.runId} executed`));
worker.on("failed", (job, err) => console.error(`engine: run ${job?.data.runId} failed`, err));
console.log("engine worker started; waiting for runs…");

/**
 * Graceful shutdown (S07). Because every step is checkpointed, a deploy is no longer an incident: on
 * SIGTERM we stop taking NEW jobs and let the in-flight run finish its current step and commit its
 * checkpoint (`worker.close()` waits for the active job). If the process is killed harder, the run is
 * requeued and RESUMES from its last checkpoint — no duplicate side effects. The durability machinery
 * makes clean deploys nearly free; failure-handling and deploy-handling converge.
 */
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: draining — finishing the current step, then exiting`);
  try {
    await worker.close(); // waits for the active job to reach its next checkpoint
    await connection.quit();
    process.exit(0);
  } catch (err) {
    console.error("error during shutdown", err);
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
