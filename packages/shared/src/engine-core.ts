import type { HttpStepDef, RunEvent, RunStatus, StepStatus } from "./run";

/**
 * The naive execution core (S01) — deliberately the "before" photo.
 *
 * It runs a relay's steps in order and produces the RunEvent log + per-step outcomes. It is a PURE
 * function of its inputs and its injected dependencies (an HTTP client + a clock), which is why it can
 * be integration-tested with zero infrastructure — no Redis, no Postgres, no network. The BullMQ worker
 * and Prisma persistence in `apps/engine` are a thin shell around this.
 *
 * 🔍 Review lens — enumerate what is MISSING here, because that list is the course syllabus:
 *   - no RETRIES (a 500 from the vendor kills the run)            → S05 in-PR arc, S07
 *   - no CHECKPOINTS (crash mid-run = start over, re-run steps)   → S07 durable engine
 *   - no IDEMPOTENCY (a retry could double-send a real email)     → S07, and every connector from S02
 *   - no TIMEOUT (a hung vendor hangs the worker forever)         → S07
 *   - no PARALLELISM / branching (strictly linear)                → S08 the DAG
 * Naming the omissions now is the whole point; we will feel each one before we fix it.
 */

export interface HttpRequestInput {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}
export interface HttpResponse {
  status: number;
  body: unknown;
}
export type HttpRequestFn = (input: HttpRequestInput) => Promise<HttpResponse>;

export interface EngineDeps {
  httpRequest: HttpRequestFn;
  /** injected clock so event timestamps are deterministic under test */
  now: () => number;
}

export interface StepOutcome {
  stepId: string;
  status: StepStatus;
  output?: unknown;
  error?: string;
}

export interface RunResult {
  status: RunStatus;
  steps: StepOutcome[];
  events: RunEvent[];
}

/**
 * Execute a relay end to end. Linear, fail-fast: the first failed step stops the run. Every transition
 * is appended to `events` with a monotonic `seq` — the log is written as the run happens, not
 * reconstructed after, so even a crash leaves a truthful partial trail.
 */
export async function runRelay(steps: HttpStepDef[], deps: EngineDeps): Promise<RunResult> {
  const events: RunEvent[] = [];
  let seq = 0;
  const emit = (type: RunEvent["type"], extra?: Omit<RunEvent, "seq" | "type" | "at">) => {
    events.push({ seq: seq++, type, at: deps.now(), ...extra });
  };

  const outcomes: StepOutcome[] = [];
  emit("run.created");
  emit("run.started");

  for (const step of steps) {
    emit("step.started", { stepId: step.id });
    try {
      const res = await deps.httpRequest({
        method: step.method,
        url: step.url,
        headers: step.headers,
        body: step.body,
      });
      // Naive success rule: any non-4xx/5xx is success. No retry on 5xx, no honoring Retry-After.
      if (res.status >= 400) {
        const error = `HTTP ${res.status}`;
        outcomes.push({ stepId: step.id, status: "failed", error });
        emit("step.failed", { stepId: step.id, data: { status: res.status } });
        emit("run.failed", { stepId: step.id, data: { error } });
        return { status: "failed", steps: outcomes, events };
      }
      outcomes.push({ stepId: step.id, status: "succeeded", output: res.body });
      emit("step.succeeded", { stepId: step.id, data: { status: res.status } });
    } catch (err) {
      // A thrown error (network, timeout) — same fail-fast treatment. Note there's nowhere to resume
      // from: this is exactly the gap S07's checkpointing closes.
      const error = err instanceof Error ? err.message : String(err);
      outcomes.push({ stepId: step.id, status: "failed", error });
      emit("step.failed", { stepId: step.id, data: { error } });
      emit("run.failed", { stepId: step.id, data: { error } });
      return { status: "failed", steps: outcomes, events };
    }
  }

  emit("run.succeeded");
  return { status: "succeeded", steps: outcomes, events };
}
