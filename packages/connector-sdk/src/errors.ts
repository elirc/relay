/**
 * The closed connector error taxonomy (S03).
 *
 * Vendors fail in unboundedly many ways — a 429 here, a `{ ok:false }` there, a truncated body, a
 * revoked token. The engine (S07) has to make **retry decisions per error class**, and it cannot
 * reason about an open-ended set of vendor-specific shapes. So every vendor failure is normalized into
 * ONE of a small, closed set of kinds. This normalization is the single most important design in the
 * SDK: it's what makes engine-level retry policy possible at all.
 *
 *   RateLimited → back off (honor Retry-After if present), then retry
 *   VendorDown  → transient; retry with backoff
 *   AuthFailed  → do NOT retry; the connection needs re-auth (mark unhealthy)
 *   BadInput    → do NOT retry; our request was wrong; surface to the user
 *   Unknown     → conservative default; treated as non-retryable until classified
 */
export type ConnectorErrorKind =
  | "RateLimited"
  | "AuthFailed"
  | "VendorDown"
  | "BadInput"
  | "Unknown";

export class ConnectorError extends Error {
  constructor(
    public readonly kind: ConnectorErrorKind,
    message: string,
    /** for RateLimited: how long to wait before retrying, if the vendor told us */
    public readonly retryAfterMs?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ConnectorError";
  }

  /** Whether the engine should even consider retrying this class of failure. */
  get retryable(): boolean {
    return this.kind === "RateLimited" || this.kind === "VendorDown";
  }
}
