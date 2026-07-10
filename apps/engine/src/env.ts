import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  // The hardcoded demo action's target. A GET here returns 200 for the happy-path skeleton.
  // From S03 the action is connector config, not an env var.
  DEMO_ACTION_URL: z.string().url().default("https://example.com"),
});

export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
