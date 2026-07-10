import { percentile } from "@relay/shared";

/**
 * Engine metrics (S15) — you can't fix automations you can't see. The crucial design choice is the
 * BREAKDOWN: an aggregate failure rate hides the story ("everything's 3% failing" tells you nothing).
 * Break failures down **by connector AND by error class**, and a degraded vendor announces itself
 * ("MailPost is 40% RateLimited") before customers open tickets. Queue depth is tracked per lane (S11) so
 * a backed-up bulk lane doesn't look like a healthy interactive one.
 */
export interface EngineMetricsSnapshot {
  steps: number;
  retryRate: number;
  failureRate: number;
  stepLatencyP95Ms: number;
  queueDepthByLane: Record<string, number>;
  failuresByConnector: Record<string, number>;
  failuresByErrorClass: Record<string, number>;
}

const LATENCY_CAP = 1024;

export class EngineMetrics {
  private latencies: number[] = [];
  private steps = 0;
  private retries = 0;
  private failures = 0;
  private byConnector = new Map<string, number>();
  private byErrorClass = new Map<string, number>();
  private queue: Record<string, number> = { interactive: 0, scheduled: 0, bulk: 0 };

  recordStep(latencyMs: number): void {
    this.steps += 1;
    this.latencies.push(latencyMs);
    if (this.latencies.length > LATENCY_CAP) this.latencies.shift(); // bounded — a metric mustn't leak
  }
  recordRetry(): void {
    this.retries += 1;
  }
  recordFailure(connector: string, errorClass: string): void {
    this.failures += 1;
    this.byConnector.set(connector, (this.byConnector.get(connector) ?? 0) + 1);
    this.byErrorClass.set(errorClass, (this.byErrorClass.get(errorClass) ?? 0) + 1);
  }
  setQueueDepth(lane: string, depth: number): void {
    this.queue[lane] = depth;
  }

  snapshot(): EngineMetricsSnapshot {
    return {
      steps: this.steps,
      retryRate: this.steps === 0 ? 0 : this.retries / this.steps,
      failureRate: this.steps === 0 ? 0 : this.failures / this.steps,
      stepLatencyP95Ms: percentile(this.latencies, 0.95),
      queueDepthByLane: { ...this.queue },
      failuresByConnector: Object.fromEntries(this.byConnector),
      failuresByErrorClass: Object.fromEntries(this.byErrorClass),
    };
  }
}
