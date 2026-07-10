import { verifySignature } from "@relay/vendor-farm";

/**
 * Inbound webhook verification (S13, flaw #4 fix). For seven sprints the receiver accepted UNSIGNED
 * payloads — an unauthenticated inbound webhook is an unauthenticated way to trigger arbitrary customer
 * automations (and all their real side effects). The farm signs every webhook (HMAC, S02); we now
 * verify. The standard trio: **signature** (authenticity) + **timestamp window** (freshness, inside
 * verifySignature) + **replay dedupe** (a captured-and-replayed request is refused even if valid).
 */
const REPLAY_TTL_MS = 5 * 60 * 1000;

export interface ReplayGuard {
  has(sig: string): boolean;
  add(sig: string): void;
}

export class MemoryReplayGuard implements ReplayGuard {
  private seen = new Map<string, number>();
  constructor(
    private readonly ttlMs = REPLAY_TTL_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}
  has(sig: string): boolean {
    this.evict();
    return this.seen.has(sig);
  }
  add(sig: string): void {
    this.seen.set(sig, this.now() + this.ttlMs);
  }
  private evict(): void {
    const t = this.now();
    for (const [k, exp] of this.seen) if (exp <= t) this.seen.delete(k);
  }
}

export type WebhookVerdict = "ok" | "bad-signature" | "replayed";

export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
  guard: ReplayGuard,
  now: number = Date.now(),
): WebhookVerdict {
  if (!signatureHeader) return "bad-signature";
  if (!verifySignature(rawBody, signatureHeader, secret, { now, toleranceSec: 300 })) return "bad-signature";
  if (guard.has(signatureHeader)) return "replayed"; // captured and re-sent within the window
  guard.add(signatureHeader);
  return "ok";
}
