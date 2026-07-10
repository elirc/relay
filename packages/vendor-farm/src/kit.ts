import type { FastifyInstance, FastifyReply } from "fastify";
import { OAuthServer, isOAuthError, type TokenSet } from "./oauth";
import { injectFailure, type FailureConfig } from "./chaos";

/** Shared per-vendor runtime state: its OAuth server, its chaos config, and a seeded RNG. */
export interface VendorState {
  oauth: OAuthServer;
  failure: FailureConfig;
  rng: () => number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The OAuth token-endpoint response shape is one of the few things vendors mostly agree on. */
function tokenResponse(t: TokenSet) {
  return {
    access_token: t.accessToken,
    refresh_token: t.refreshToken,
    expires_in: t.expiresInSec,
    scope: t.scope,
    token_type: "bearer",
  };
}

/**
 * Mount the standard OAuth endpoints. `/oauth/authorize` 302-redirects back to the app's `redirect_uri`
 * with `?code&state` (auto-consent — the farm doesn't render a login screen). `/oauth/token` handles
 * both the authorization_code exchange and refresh_token grant.
 */
export function mountOAuth(app: FastifyInstance, state: VendorState): void {
  app.get("/oauth/authorize", async (req, reply) => {
    const q = req.query as Record<string, string>;
    const res = state.oauth.authorize({
      clientId: q.client_id,
      redirectUri: q.redirect_uri,
      scope: q.scope ?? "",
      state: q.state,
    });
    if (isOAuthError(res)) return reply.code(400).send(res);
    const url = new URL(q.redirect_uri);
    url.searchParams.set("code", res.code);
    if (res.state) url.searchParams.set("state", res.state);
    return reply.redirect(url.toString());
  });

  app.post("/oauth/token", async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string>;
    if (b.grant_type === "authorization_code") {
      const r = state.oauth.exchangeCode({
        code: b.code,
        clientId: b.client_id,
        clientSecret: b.client_secret,
        redirectUri: b.redirect_uri,
      });
      return isOAuthError(r) ? reply.code(400).send(r) : reply.send(tokenResponse(r));
    }
    if (b.grant_type === "refresh_token") {
      const r = state.oauth.refresh({
        refreshToken: b.refresh_token,
        clientId: b.client_id,
        clientSecret: b.client_secret,
      });
      return isOAuthError(r) ? reply.code(400).send(r) : reply.send(tokenResponse(r));
    }
    return reply.code(400).send({ error: "unsupported_grant_type" });
  });
}

/** Each vendor supplies its OWN error bodies — the shapes are deliberately different (see the READMEs). */
export interface ChaosShapes {
  rateLimited: () => unknown;
  serverError: () => unknown;
}

/**
 * Run the chaos gate for one resource request. Returns `true` if the handler should proceed, or sends
 * the injected failure (in the vendor's error shape) and returns `false`. The `malformed` case is the
 * sneakiest: a 200 with truncated JSON — a client that trusts the status code will explode on parse.
 */
export async function applyChaos(
  state: VendorState,
  reply: FastifyReply,
  shapes: ChaosShapes,
): Promise<boolean> {
  const inj = injectFailure(state.failure, state.rng);
  if (inj.delayMs) await sleep(inj.delayMs);
  switch (inj.kind) {
    case "429":
      if (inj.retryAfterSec !== undefined) void reply.header("retry-after", String(inj.retryAfterSec));
      void reply.code(429).send(shapes.rateLimited());
      return false;
    case "5xx":
      void reply.code(503).send(shapes.serverError());
      return false;
    case "malformed":
      void reply.header("content-type", "application/json").code(200).send('{"data":[ ');
      return false;
    case "ok":
      return true;
  }
}
