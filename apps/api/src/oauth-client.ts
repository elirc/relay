import { prisma, type Connection } from "@relay/db";
import { VENDOR_META, DEV_CLIENTS, type VendorName } from "@relay/vendor-farm";
import { SingleFlight } from "@relay/shared";
import { env } from "./env";
import { orgCipher } from "./secrets";

/**
 * Relay as an OAuth *client* to the vendor farm (S02). Builds authorize URLs, exchanges codes, and —
 * the interesting part — refreshes tokens with **single-flight** so concurrent refreshes can't rotate
 * the token out from under each other (the refresh-race fix). A refresh failure marks the connection
 * unhealthy: connection rot is a *stored, surfaced* state, not a surprise at run time.
 */

const REDIRECT_URI = `${env.API_URL}/api/connections/callback`;

export function authorizeUrl(vendor: VendorName, state: string): string {
  const meta = VENDOR_META[vendor];
  const url = new URL(env.VENDOR_FARM_URL + meta.authorizePath);
  url.searchParams.set("client_id", DEV_CLIENTS[vendor].clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", meta.scopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResp {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

async function tokenRequest(vendor: VendorName, body: Record<string, string>): Promise<TokenResp> {
  const res = await fetch(env.VENDOR_FARM_URL + VENDOR_META[vendor].tokenPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: DEV_CLIENTS[vendor].clientId,
      client_secret: DEV_CLIENTS[vendor].clientSecret,
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
  return (await res.json()) as TokenResp;
}

export function exchangeCode(vendor: VendorName, code: string): Promise<TokenResp> {
  return tokenRequest(vendor, { grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI });
}

// Coalesce refreshes per connection id — the fix from the S02 refresh-race arc.
const refreshFlight = new SingleFlight<Connection>();

export function refreshConnection(connectionId: string): Promise<Connection> {
  return refreshFlight.run(connectionId, async () => {
    const conn = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });
    const cipher = await orgCipher(conn.orgId);
    if (!conn.refreshTokenEnc) throw new Error("connection has no refresh token");
    const refreshToken = cipher.open(conn.refreshTokenEnc);
    try {
      const t = await tokenRequest(conn.vendor as VendorName, {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
      return await prisma.connection.update({
        where: { id: connectionId },
        data: {
          accessTokenEnc: cipher.seal(t.access_token),
          refreshTokenEnc: cipher.seal(t.refresh_token),
          expiresAt: new Date(Date.now() + t.expires_in * 1000),
          status: "healthy",
        },
      });
    } catch (err) {
      // The vendor rejected our refresh (revoked, descoped). Record it — a run tonight will see the
      // connection is unhealthy instead of failing mysteriously.
      await prisma.connection.update({ where: { id: connectionId }, data: { status: "unhealthy" } });
      throw err;
    }
  });
}
