import { assertUrlAllowed } from "./ssrf";

/**
 * Proxied fetch (S09): the sandbox's ONLY network door. Code steps never touch `fetch` directly — they
 * call a host function that (1) gates the URL through the SSRF blocklist + per-org allowlist, (2) applies
 * a timeout that counts against the step's budget, and (3) returns a plain result. Because every request
 * funnels here, egress policy and observability live in one place — the same chokepoint discipline as the
 * connector `ctx.http` (S03), applied to untrusted code.
 */
export interface ProxiedFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export async function proxiedFetch(
  rawUrl: string,
  allowlist: readonly string[],
  init: ProxiedFetchInit = {},
): Promise<{ status: number; body: unknown }> {
  const url = assertUrlAllowed(rawUrl, allowlist); // throws SandboxBlockedEgress on any violation
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 5000);
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}
