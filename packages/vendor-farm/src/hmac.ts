import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC webhook signing (S02). Vendors sign the webhooks they send so the receiver can prove the
 * payload (a) came from the vendor and (b) wasn't replayed. This is the Stripe-style scheme:
 * sign `timestamp.body`, ship `t=<ts>,v1=<hex>` in a header. Relay's webhook receiver will verify
 * this — and in S06 the flaw ledger records that we *skip* verification at first, then S13 adds it.
 *
 * Two properties matter and both are here:
 *  - **timing-safe comparison** (`timingSafeEqual`) so an attacker can't recover the signature byte by
 *    byte from response-time differences;
 *  - a **timestamp tolerance** so a captured-and-replayed request expires.
 */

export interface SignatureHeader {
  timestamp: number;
  v1: string;
}

export function signPayload(body: string, secret: string, timestamp: number): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

export function parseSignatureHeader(header: string): SignatureHeader | null {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, v] = kv.split("=", 2);
      return [k.trim(), v];
    }),
  );
  const timestamp = Number(parts["t"]);
  const v1 = parts["v1"];
  if (!Number.isFinite(timestamp) || typeof v1 !== "string") return null;
  return { timestamp, v1 };
}

export function verifySignature(
  body: string,
  header: string,
  secret: string,
  opts: { now?: number; toleranceSec?: number } = {},
): boolean {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;

  const now = opts.now ?? Date.now();
  const toleranceSec = opts.toleranceSec ?? 300;
  // Reject stale (replayed) or future-dated signatures.
  if (Math.abs(now - parsed.timestamp) > toleranceSec * 1000) return false;

  const expected = createHmac("sha256", secret).update(`${parsed.timestamp}.${body}`).digest();
  const actual = Buffer.from(parsed.v1, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
