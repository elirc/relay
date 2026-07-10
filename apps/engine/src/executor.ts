import { ConnectorError } from "@relay/connector-sdk";

/**
 * Per-step retry policy (S05). The S3 error taxonomy pays off HERE: retry logic is a small legible
 * table keyed on five error classes, not vendor-specific spaghetti scattered through connectors.
 *
 *   RateLimited → retry, honoring Retry-After (retrying without it is aggression that earns a longer ban)
 *   VendorDown  → retry with exponential backoff (transient)
 *   AuthFailed  → do NOT retry (the connection needs re-auth; retrying just spams a dead credential)
 *   BadInput    → do NOT retry (our request was wrong; a retry sends the same wrong request)
 *   anything else → do NOT retry (conservative default)
 */
export interface RetryDecision {
  retry: boolean;
  delayMs: number;
}

export const MAX_ATTEMPTS = 4;

function backoff(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** (attempt - 1));
}

export function retryPolicy(error: unknown, attempt: number): RetryDecision {
  if (!(error instanceof ConnectorError)) return { retry: false, delayMs: 0 };
  if (attempt >= MAX_ATTEMPTS) return { retry: false, delayMs: 0 };
  switch (error.kind) {
    case "RateLimited":
      return { retry: true, delayMs: error.retryAfterMs ?? backoff(attempt) };
    case "VendorDown":
      return { retry: true, delayMs: backoff(attempt) };
    case "AuthFailed":
    case "BadInput":
    default:
      return { retry: false, delayMs: 0 };
  }
}

export interface StepInput {
  id: string;
  connector: string;
  action: string;
  config: Record<string, unknown>;
}

export interface ExecDeps {
  renderConfig: (
    config: Record<string, unknown>,
    scope: { trigger: unknown; steps: unknown[] },
  ) => Record<string, unknown>;
  /** run ONE attempt of the action — this is where the real external side effect happens */
  runAction: (step: StepInput, input: Record<string, unknown>, attempt: number) => Promise<unknown>;
  /** persist a completed step's output (StepRun) — called AFTER the action succeeded */
  persistStep: (index: number, step: StepInput, output: unknown) => Promise<void>;
  /** restore an already-persisted step's output on resume (so we don't re-execute it) */
  loadPersistedOutput: (index: number) => Promise<unknown>;
  emit: (type: string, data?: Record<string, unknown>) => void;
  sleep: (ms: number) => Promise<void>;
}

async function runWithRetry(step: StepInput, input: Record<string, unknown>, deps: ExecDeps): Promise<unknown> {
  let attempt = 1;
  for (;;) {
    try {
      return await deps.runAction(step, input, attempt);
    } catch (err) {
      const { retry, delayMs } = retryPolicy(err, attempt);
      if (!retry) throw err;
      deps.emit("step.retry", { stepId: step.id, attempt, delayMs });
      await deps.sleep(delayMs);
      attempt += 1;
    }
  }
}

/**
 * Execute a run's steps in order.
 *
 * The step pipeline is **render → (validate, inside runAction) → execute → persist**, and the ORDER is
 * load-bearing: we render first because expressions produce the real input; we persist AFTER executing
 * because we can only record an output we have. And right there — between `runWithRetry` returning and
 * `persistStep` completing — is THE CRASH WINDOW: the side effect landed on the vendor, but our record
 * of it did not. See `executor.test.ts`. `completed` (the set of durably-persisted step indices) lets a
 * restart skip steps it already finished — which NARROWS that window to the single in-flight step, but
 * does not close it. Closing it (checkpoint + idempotency enforcement) is S07, not a commit here.
 */
export async function executeRun(
  steps: StepInput[],
  trigger: unknown,
  deps: ExecDeps,
  completed: Set<number> = new Set(),
): Promise<void> {
  const outputs: unknown[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (completed.has(i)) {
      // Already durably done on a previous attempt — restore its output, do NOT re-execute it. This is
      // exactly what resume buys us: prior steps' side effects are not re-fired.
      outputs[i] = await deps.loadPersistedOutput(i);
      continue;
    }
    const scope = { trigger, steps: outputs.map((o) => ({ output: o })) };
    const input = deps.renderConfig(step.config, scope);
    deps.emit("step.started", { stepId: step.id });

    const output = await runWithRetry(step, input, deps); // side effect happens
    await deps.persistStep(i, step, output); // ← crash between the two lines above = duplicate on resume
    completed.add(i);
    outputs[i] = output;
    deps.emit("step.succeeded", { stepId: step.id });
  }
}
