import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  // The hardcoded demo action's target. A GET here returns 200 for the happy-path skeleton.
  // From S03 the action is connector config, not an env var.
  DEMO_ACTION_URL: z.string().url().default("https://example.com"),
  // The mock vendor farm the connectors call.
  VENDOR_FARM_URL: z.string().url().default("http://localhost:4000"),
  // Master KEK to decrypt connection tokens (must match the API's). 32 bytes, base64.
  RELAY_MASTER_KEK: z.string().default("cmVsYXktZGV2LW1hc3Rlci1rZXktMDEyMzQ1Njc4OWE="),
});

export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
