import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(3001),
  // Where this API is reachable — used to build OAuth redirect_uri callbacks.
  API_URL: z.string().url().default("http://localhost:3001"),
  // Next.js dev server origin — allowed by CORS, and where we bounce the user after connecting.
  WEB_URL: z.string().url().default("http://localhost:3000"),
  // Optional so the API can boot (health) without a database in dev/CI.
  DATABASE_URL: z.string().url().optional(),
  // Redis holds the job queue (BullMQ). Only touched when a hook actually enqueues a run.
  REDIS_URL: z.string().default("redis://localhost:6379"),
  // The mock vendor farm (S02). In prod these would be real vendor base URLs, per connector.
  VENDOR_FARM_URL: z.string().url().default("http://localhost:4000"),
  // Master key-encryption-key (base64, 32 bytes) for envelope-encrypting connection tokens (ADR-0004).
  // Defaults to a well-known DEV key so local dev boots; a real deployment MUST override it.
  RELAY_MASTER_KEK: z
    .string()
    .default("cmVsYXktZGV2LW1hc3Rlci1rZXktMDEyMzQ1Njc4OWE="),
});

/**
 * Validate env at boot. Bad config crashes HERE with a clear message — not at the first
 * request that happens to need the missing value.
 */
export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
