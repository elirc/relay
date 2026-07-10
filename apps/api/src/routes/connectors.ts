import type { FastifyInstance } from "fastify";
import { buildRegistry } from "@relay/connectors";

// The registry is built once at boot — registration validates every connector's SDK invariants
// (notably: every action declares idempotency), so a broken connector crashes startup, not a run.
const registry = buildRegistry();

/**
 * Expose connector metadata for the builder UI (S04 turns these schemas into forms) and for humans
 * browsing what Relay can do. Definitions are DATA, so they can be introspected and served like this;
 * code-as-plugin could only be executed, never described.
 */
export async function connectorRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/connectors", async () => registry.metadata());
}
