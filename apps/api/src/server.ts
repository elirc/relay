import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { ZodError } from "zod";
import { env } from "./env";
import { healthRoutes } from "./routes/health";
import { hookRoutes } from "./routes/hooks";
import { runRoutes } from "./routes/runs";
import { authRoutes } from "./auth";
import { connectionRoutes } from "./routes/connections";

/**
 * Build (but don't start) the app so tests can boot it in-process via `app.inject(...)`.
 * Handlers throw typed errors; we translate them to a JSON envelope once, here at the edge.
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV === "production" ? { level: "info" } : false,
  });

  // The Next.js web app is a different origin in dev — allow it with credentials so the session
  // cookie round-trips.
  void app.register(cors, { origin: env.WEB_URL, credentials: true });
  void app.register(cookie);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      void reply.code(400).send({ error: { code: "VALIDATION", message: "Invalid request" } });
      return;
    }
    void reply.code(500).send({ error: { code: "INTERNAL", message: "Internal error" } });
  });

  void app.register(healthRoutes);
  void app.register(authRoutes);
  void app.register(hookRoutes);
  void app.register(runRoutes);
  void app.register(connectionRoutes);
  return app;
}
