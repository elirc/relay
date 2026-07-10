import { z } from "zod";

/**
 * The vocabulary of a run (S01). A "relay" is a workflow: a trigger followed by one or more action
 * steps. When it fires, we create a **Run**; each action becomes a **StepRun**; and every meaningful
 * thing that happens is appended to the **RunEvent** log.
 *
 * The RunEvent log exists from day one — before the real engine, before retries, before checkpoints.
 * That's deliberate: in an automation product the execution log IS the product. Users don't debug your
 * engine; they debug *their* workflow using *your* events. Ship the observability surface first, and
 * every later sprint gets to demonstrate itself. (The same instinct as an append-only mutation log.)
 */

export type RunStatus = "pending" | "running" | "succeeded" | "failed";
export type StepStatus = "pending" | "running" | "succeeded" | "failed";

/** The append-only execution events. Order is the story of the run. */
export type RunEventType =
  | "run.created"
  | "run.started"
  | "step.started"
  | "step.succeeded"
  | "step.failed"
  | "run.succeeded"
  | "run.failed";

export interface RunEvent {
  /** monotonic within a run — the log's ordering key, independent of wall-clock */
  seq: number;
  type: RunEventType;
  at: number;
  /** which step this event concerns, if any */
  stepId?: string;
  /** small, structured payload (status code, error message, output ref) — never the whole body */
  data?: Record<string, unknown>;
}

/** The inbound demo webhook body. Kept permissive: a trigger's payload is whatever the caller sends. */
export const DemoWebhookPayloadSchema = z.object({
  email: z.string().email().optional(),
  message: z.string().optional(),
}).passthrough();
export type DemoWebhookPayload = z.infer<typeof DemoWebhookPayloadSchema>;

/**
 * A hardcoded HTTP action step. In S01 the whole relay is one of these, wired in code. From S03 the
 * connector SDK turns this shape into declarative data; for now it's the embryo of every action.
 */
export interface HttpStepDef {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}
