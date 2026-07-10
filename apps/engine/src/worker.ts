import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { prisma, Prisma } from "@relay/db";
import { runRelay, type EngineDeps, type HttpRequestFn, type HttpStepDef } from "@relay/shared";
import { env } from "./env";

const RUN_QUEUE = "relay:runs";

/**
 * The naive engine (S01) — deliberately one file, deliberately the "before" photo (ADR-0001: it's a
 * *dedicated app*, not a route in the API, because execution is a different workload from serving
 * requests). It picks a run off the queue, executes the hardcoded relay via the pure core in
 * @relay/shared, and records StepRuns + the RunEvent log.
 *
 * Reread this at S07 and laugh: no retries, no timeouts, no idempotency, and — see the ⚠️ below —
 * no checkpointing. Every one of those omissions is a future sprint.
 */

// Real HTTP via global fetch (Node 20+). The naive client: no timeout, no retry, no idempotency key.
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

// The hardcoded relay: exactly one action. From S03 this becomes declarative connector config.
function demoSteps(): HttpStepDef[] {
  return [{ id: "notify", method: "GET", url: env.DEMO_ACTION_URL }];
}

const asJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === undefined || v === null ? undefined : (v as Prisma.InputJsonValue);

async function execute(job: Job<{ runId: string }>): Promise<void> {
  const { runId } = job.data;
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) return; // job references a run that no longer exists — nothing to do

  await prisma.run.update({
    where: { id: runId },
    data: { status: "running", startedAt: new Date() },
  });

  const deps: EngineDeps = { httpRequest, now: () => Date.now() };
  const result = await runRelay(demoSteps(), deps);

  // ⚠️ THE "before" photo: we computed the ENTIRE run in memory and only persist it now, at the end,
  // in one transaction. A crash between the "running" update above and this write loses the whole
  // event trail and strands the run in "running" forever — and if a step had already sent a real
  // email, a re-run would send it AGAIN. Incremental checkpointing (persist each event as it happens;
  // resume from the last durable step; make side effects idempotent) is exactly what S07's durable
  // engine adds. This block is the scenario S05's in-PR arc and S07's flagship are built around.
  await prisma.$transaction([
    ...result.events.map((e) =>
      prisma.runEvent.create({
        data: {
          runId,
          seq: e.seq,
          type: e.type,
          stepId: e.stepId,
          data: asJson(e.data),
          at: new Date(e.at),
        },
      }),
    ),
    ...result.steps.map((s) =>
      prisma.stepRun.upsert({
        where: { runId_stepId: { runId, stepId: s.stepId } },
        create: { runId, stepId: s.stepId, status: s.status, output: asJson(s.output), error: s.error },
        update: { status: s.status, output: asJson(s.output), error: s.error },
      }),
    ),
    prisma.run.update({
      where: { id: runId },
      data: { status: result.status, finishedAt: new Date() },
    }),
  ]);
}

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const worker = new Worker(RUN_QUEUE, execute, { connection });

worker.on("completed", (job) => console.log(`engine: run ${job.data.runId} executed`));
worker.on("failed", (job, err) => console.error(`engine: run ${job?.data.runId} failed`, err));
console.log("engine worker started; waiting for runs…");
