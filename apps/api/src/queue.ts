import IORedis from "ioredis";
import { Queue } from "bullmq";
import { env } from "./env";

/**
 * The run queue (S01). The API enqueues a job; the engine (a separate app — ADR-0001) consumes it.
 *
 * 🔗 ADR-0002: this queue holds *work*, not truth. The Run already exists in Postgres before we
 * enqueue; the job is just a pointer ("go execute run X"). If Redis lost this job, the Run row would
 * still be there, stuck in `pending` — recoverable. If we'd stored the run *in* the job, a Redis flush
 * would erase business history. That distinction is the whole plot of S07.
 *
 * The connection + queue are created LAZILY so importing this module (e.g. from a health-only test)
 * never opens a Redis socket. `maxRetriesPerRequest: null` is required by BullMQ for blocking commands.
 */
export const RUN_QUEUE = "relay:runs";

let connection: IORedis | null = null;
let queue: Queue | null = null;

function conn(): IORedis {
  return (connection ??= new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }));
}

export function runQueue(): Queue {
  return (queue ??= new Queue(RUN_QUEUE, { connection: conn() }));
}

export async function enqueueRun(runId: string): Promise<void> {
  await runQueue().add("execute", { runId }, { removeOnComplete: 1000, removeOnFail: 5000 });
}
