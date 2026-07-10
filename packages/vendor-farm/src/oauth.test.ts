import { describe, it, expect } from "vitest";
import { OAuthServer, isOAuthError } from "./oauth";

const cfg = { clientId: "c", clientSecret: "s" };

function connect(server: OAuthServer) {
  const a = server.authorize({ clientId: "c", redirectUri: "https://app/cb", scope: "email.send" });
  if (isOAuthError(a)) throw new Error(a.error);
  const t = server.exchangeCode({ code: a.code, clientId: "c", clientSecret: "s", redirectUri: "https://app/cb" });
  if (isOAuthError(t)) throw new Error(t.error);
  return t;
}

describe("OAuthServer", () => {
  it("authorization codes are single-use", () => {
    const s = new OAuthServer(cfg);
    const a = s.authorize({ clientId: "c", redirectUri: "https://app/cb", scope: "x" });
    if (isOAuthError(a)) throw new Error("authorize failed");
    const first = s.exchangeCode({ code: a.code, clientId: "c", clientSecret: "s", redirectUri: "https://app/cb" });
    const second = s.exchangeCode({ code: a.code, clientId: "c", clientSecret: "s", redirectUri: "https://app/cb" });
    expect(isOAuthError(first)).toBe(false);
    expect(second).toEqual({ error: "invalid_grant" });
  });

  it("rejects a wrong client secret", () => {
    const s = new OAuthServer(cfg);
    const a = s.authorize({ clientId: "c", redirectUri: "https://app/cb", scope: "x" });
    if (isOAuthError(a)) throw new Error("authorize failed");
    expect(s.exchangeCode({ code: a.code, clientId: "c", clientSecret: "WRONG", redirectUri: "https://app/cb" })).toEqual({
      error: "invalid_client",
    });
  });

  it("refresh ROTATES the token — the old refresh token is revoked (the race made real)", () => {
    const s = new OAuthServer(cfg);
    const t = connect(s);

    const refreshed = s.refresh({ refreshToken: t.refreshToken, clientId: "c", clientSecret: "s" });
    expect(isOAuthError(refreshed)).toBe(false);

    // A SECOND refresh with the SAME (now-rotated) token fails — this is what breaks a naive client
    // that fires two concurrent refreshes.
    const reused = s.refresh({ refreshToken: t.refreshToken, clientId: "c", clientSecret: "s" });
    expect(reused).toEqual({ error: "invalid_grant" });
  });

  it("introspect reflects revocation (connection-health scenario)", () => {
    const s = new OAuthServer(cfg);
    const t = connect(s);
    expect(s.introspect(t.accessToken).active).toBe(true);
    const { accountId } = s.introspect(t.accessToken);
    s.revokeAccount(accountId!);
    expect(s.introspect(t.accessToken).active).toBe(false);
  });
});
