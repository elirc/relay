import { randomBytes } from "node:crypto";

/**
 * An in-memory OAuth2 authorization server (S02) — the vendor side of the handshake. It issues
 * single-use authorization codes, exchanges them for tokens, and refreshes tokens.
 *
 * ⚠️ The load-bearing behavior for the course: `refresh()` **rotates** the refresh token — the old one
 * is revoked the instant a new one is issued. Real providers (Google, etc.) do exactly this. It's why
 * a naive OAuth client that refreshes concurrently corrupts itself: two requests refresh with the same
 * token, the first rotates it, and the second now presents a revoked token and fails — sometimes
 * revoking the *whole connection*. That's the S02 refresh-race arc, made real here rather than mocked.
 */

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  scope: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  /** short by default so refresh is actually exercised in dev/tests */
  accessTtlSec?: number;
}

interface AuthCode {
  redirectUri: string;
  scope: string;
  used: boolean;
}
interface Grant {
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresAt: number;
  accountId: string;
}

export type OAuthError = { error: string };
export const isOAuthError = (v: unknown): v is OAuthError =>
  typeof v === "object" && v !== null && "error" in v;

export class OAuthServer {
  private codes = new Map<string, AuthCode>();
  private grantsByRefresh = new Map<string, Grant>();
  private grantsByAccess = new Map<string, Grant>();
  private revokedRefresh = new Set<string>();
  private accountSeq = 0;

  constructor(private cfg: OAuthConfig) {}

  /** /authorize — the user consents; we mint a single-use code bound to this redirect_uri + scope. */
  authorize(params: {
    clientId: string;
    redirectUri: string;
    scope: string;
    state?: string;
  }): { code: string; state?: string } | OAuthError {
    if (params.clientId !== this.cfg.clientId) return { error: "invalid_client" };
    const code = "code_" + rnd();
    this.codes.set(code, { redirectUri: params.redirectUri, scope: params.scope, used: false });
    return { code, state: params.state };
  }

  /** /token grant_type=authorization_code — codes are single-use and bound to their redirect_uri. */
  exchangeCode(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): TokenSet | OAuthError {
    if (!this.clientOk(params)) return { error: "invalid_client" };
    const c = this.codes.get(params.code);
    if (!c || c.used) return { error: "invalid_grant" };
    if (c.redirectUri !== params.redirectUri) return { error: "redirect_uri_mismatch" };
    c.used = true;
    return this.toTokenSet(this.mint(c.scope, "acct_" + ++this.accountSeq));
  }

  /** /token grant_type=refresh_token — ROTATES: the presented refresh token is revoked on success. */
  refresh(params: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  }): TokenSet | OAuthError {
    if (!this.clientOk(params)) return { error: "invalid_client" };
    if (this.revokedRefresh.has(params.refreshToken)) return { error: "invalid_grant" };
    const old = this.grantsByRefresh.get(params.refreshToken);
    if (!old) return { error: "invalid_grant" };
    this.revokedRefresh.add(params.refreshToken);
    this.grantsByRefresh.delete(params.refreshToken);
    this.grantsByAccess.delete(old.accessToken);
    return this.toTokenSet(this.mint(old.scope, old.accountId));
  }

  /** Resource endpoints call this to validate a bearer access token. */
  introspect(accessToken: string): { active: boolean; scope?: string; accountId?: string } {
    const g = this.grantsByAccess.get(accessToken);
    if (!g) return { active: false };
    if (Date.now() >= g.expiresAt) return { active: false };
    return { active: true, scope: g.scope, accountId: g.accountId };
  }

  /** Simulate the user revoking Relay's access at the vendor (the connection-health scenario). */
  revokeAccount(accountId: string): void {
    for (const [k, g] of this.grantsByRefresh) {
      if (g.accountId === accountId) {
        this.revokedRefresh.add(k);
        this.grantsByRefresh.delete(k);
      }
    }
    for (const [k, g] of this.grantsByAccess) {
      if (g.accountId === accountId) this.grantsByAccess.delete(k);
    }
  }

  private clientOk(p: { clientId: string; clientSecret: string }): boolean {
    return p.clientId === this.cfg.clientId && p.clientSecret === this.cfg.clientSecret;
  }

  private mint(scope: string, accountId: string): Grant {
    const grant: Grant = {
      accessToken: "at_" + rnd(),
      refreshToken: "rt_" + rnd(),
      scope,
      expiresAt: Date.now() + (this.cfg.accessTtlSec ?? 3600) * 1000,
      accountId,
    };
    this.grantsByRefresh.set(grant.refreshToken, grant);
    this.grantsByAccess.set(grant.accessToken, grant);
    return grant;
  }

  private toTokenSet(g: Grant): TokenSet {
    return {
      accessToken: g.accessToken,
      refreshToken: g.refreshToken,
      scope: g.scope,
      expiresInSec: Math.max(0, Math.round((g.expiresAt - Date.now()) / 1000)),
    };
  }
}

function rnd(): string {
  return randomBytes(12).toString("hex");
}
