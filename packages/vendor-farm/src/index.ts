import Fastify, { type FastifyInstance } from "fastify";
import { OAuthServer } from "./oauth";
import { makeRng, type FailureConfig } from "./chaos";
import { type VendorState } from "./kit";
import { mailpost } from "./vendors/mailpost";
import { sheetlite } from "./vendors/sheetlite";
import { chatbox } from "./vendors/chatbox";
import { VENDORS, DEV_CLIENTS, type VendorName } from "./meta";

export * from "./meta";
export * from "./chaos";
export * from "./hmac";
export * from "./oauth";
export type { VendorState } from "./kit";

export interface VendorFarmConfig {
  /** OAuth client creds the farm will accept, per vendor (defaults to DEV_CLIENTS) */
  clients: Record<VendorName, { clientId: string; clientSecret: string }>;
  /** per-vendor chaos knobs (default: no failures) */
  failure: Partial<Record<VendorName, FailureConfig>>;
  /** seed for deterministic chaos across runs */
  seed: number;
  /** access-token TTL; short by default so refresh is exercised */
  accessTtlSec: number;
}

const REGISTRARS: Record<VendorName, (app: FastifyInstance, state: VendorState) => void> = {
  mailpost,
  sheetlite,
  chatbox,
};

/**
 * Build the whole farm as one Fastify app: each vendor mounted under its own prefix
 * (`/mailpost`, `/sheetlite`, `/chatbox`), each with its own OAuth server, in-memory data, and chaos.
 * Deploy it standalone for staging, or `inject()` it in tests — same code, no network required.
 */
export function buildVendorFarm(cfg: Partial<VendorFarmConfig> = {}): FastifyInstance {
  const clients = cfg.clients ?? DEV_CLIENTS;
  const failure = cfg.failure ?? {};
  const seed = cfg.seed ?? 1;
  const accessTtlSec = cfg.accessTtlSec ?? 3600;

  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok", vendors: VENDORS }));

  VENDORS.forEach((name, i) => {
    const state: VendorState = {
      oauth: new OAuthServer({ ...clients[name], accessTtlSec }),
      failure: failure[name] ?? {},
      // distinct stream per vendor so their chaos doesn't move in lockstep, still deterministic
      rng: makeRng(seed + i * 1000),
    };
    void app.register(
      async (a) => {
        REGISTRARS[name](a, state);
      },
      { prefix: `/${name}` },
    );
  });

  return app;
}
