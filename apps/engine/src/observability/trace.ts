/**
 * Run-lifecycle tracing (S15). A run crosses five systems — trigger, queue, engine, sandbox, and the
 * vendors — and "where is this run and why is it slow?" is unanswerable unless you stitch those spans
 * together by run id. Crucially, **vendor-call spans carry the rate-governor wait time**, so a run that's
 * "slow" because it was queued behind a vendor's rate limit (not our fault) is visibly different from one
 * that's slow because our engine is struggling.
 */
export interface Span {
  name: string;
  startMs: number;
  endMs: number;
  kind?: "trigger" | "queue" | "step" | "vendor";
  /** for vendor spans: how long we waited on the rate governor before the call */
  governorWaitMs?: number;
}

export class RunTrace {
  private spans: Span[] = [];
  constructor(public readonly runId: string) {}

  add(span: Span): void {
    this.spans.push(span);
  }

  get list(): readonly Span[] {
    return this.spans;
  }

  get totalMs(): number {
    if (this.spans.length === 0) return 0;
    const start = Math.min(...this.spans.map((s) => s.startMs));
    const end = Math.max(...this.spans.map((s) => s.endMs));
    return end - start;
  }

  /** Total time spent waiting on vendor rate limits — the "slow but not our fault" number. */
  get vendorWaitMs(): number {
    return this.spans.reduce((acc, s) => acc + (s.governorWaitMs ?? 0), 0);
  }
}
