import { describe, it, expect } from "vitest";
import { OAuthServer, isOAuthError, type TokenSet } from "@relay/vendor-farm";
import { SingleFlight } from "@relay/shared";

/**
 * The S02 refresh-race arc, made real against the farm's rotating OAuth server (no DB, no HTTP).
 * A connection holds one refresh token; refreshing rotates it (the old token is revoked).
 */
function connectedServer() {
  const server = new OAuthServer({ clientId: "c", clientSecret: "s", accessTtlSec: 0 });
  const a = server.authorize({ clientId: "c", redirectUri: "cb", scope: "x" });
  if (isOAuthError(a)) throw new Error("authorize");
  const t = server.exchangeCode({ code: a.code, clientId: "c", clientSecret: "s", redirectUri: "cb" });
  if (isOAuthError(t)) throw new Error("exchange");
  return { server, refreshToken: t.refreshToken };
}

describe("OAuth refresh race", () => {
  it("NAIVE: two callers refresh with the same token → exactly one fails (self-inflicted revocation)", () => {
    const { server, refreshToken } = connectedServer();
    // Two independent callers each read the stored refresh token and call refresh.
    const r1 = server.refresh({ refreshToken, clientId: "c", clientSecret: "s" });
    const r2 = server.refresh({ refreshToken, clientId: "c", clientSecret: "s" });
    const failures = [r1, r2].filter(isOAuthError);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toEqual({ error: "invalid_grant" });
  });

  it("FIX: single-flight coalesces the refresh → one vendor call, both callers get the fresh token", async () => {
    const { server, refreshToken } = connectedServer();
    const sf = new SingleFlight<TokenSet>();
    let vendorCalls = 0;

    // The real refresh path is keyed by connection id; concurrent callers join the same flight.
    const refresh = () =>
      sf.run("conn-1", async () => {
        vendorCalls++;
        const r = server.refresh({ refreshToken, clientId: "c", clientSecret: "s" });
        if (isOAuthError(r)) throw new Error(r.error);
        return r;
      });

    const [a, b] = await Promise.all([refresh(), refresh()]);
    expect(vendorCalls).toBe(1); // only ONE refresh actually hit the vendor
    expect(a.accessToken).toBe(b.accessToken); // both got the same fresh token
  });
});
