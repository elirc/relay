import { SandboxBlockedEgress } from "./errors";

/**
 * SSRF defenses for the sandbox's only I/O door — proxied fetch (S09).
 *
 * User code + fetch = a **request forgery engine** unless you block it from reaching things the *server*
 * can reach but the user shouldn't: the cloud metadata endpoint (169.254.169.254 — the AWS/GCP credential
 * theft classic), loopback, private ranges, link-local. So egress is **allowlist-only** (per-org, by
 * host) AND the target is checked against a blocklist of internal ranges. This is allowlist-not-denylist
 * with a belt-and-suspenders blocklist: even a host you allowlisted is refused if it resolves internal.
 *
 * ⚠️ Host-based checks alone are vulnerable to **DNS rebinding** (allowlisted host resolves to
 * 127.0.0.1 at fetch time). A production proxy must resolve the host and re-check the *IP* right before
 * connecting; this module encodes the IP policy so that check has something to call.
 */

/** True if a literal IP / hostname points somewhere internal that user code must never reach. */
export function isBlockedTarget(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "metadata.google.internal") return true;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 127) return true; // this-network, loopback
    if (a === 10) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 cloud metadata)
    return false;
  }
  // IPv6 loopback / link-local / unique-local
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

/** Throw unless `rawUrl` is http(s), not an internal target, and its host is in the org's allowlist. */
export function assertUrlAllowed(rawUrl: string, allowlist: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SandboxBlockedEgress(`invalid url: ${rawUrl}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SandboxBlockedEgress(`only http(s) egress is allowed (got ${url.protocol})`);
  }
  if (isBlockedTarget(url.hostname)) {
    throw new SandboxBlockedEgress(`blocked internal target: ${url.hostname}`);
  }
  const allowed = allowlist.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  if (!allowed) throw new SandboxBlockedEgress(`host not in org allowlist: ${url.hostname}`);
  return url;
}
