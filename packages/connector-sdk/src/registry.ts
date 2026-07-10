import { ZodObject, type ZodTypeAny } from "zod";
import type { ConnectorDef } from "./connector";

/**
 * The connector registry (S03). Connectors register here; the API and UI read metadata out. Registration
 * runs the SDK invariants — most importantly, that every action declares an idempotency strategy. An
 * action that forgets one FAILS registration at boot, not at 3am when the engine retries it. (This is
 * the seed of S14's certification harness: the registry's checks are the SDK's real spec.)
 */
export class Registry {
  private connectors = new Map<string, ConnectorDef>();

  register(def: ConnectorDef): void {
    for (const action of def.actions) {
      if (!action.idempotency) {
        throw new Error(`connector "${def.key}" action "${action.key}" is missing its idempotency declaration`);
      }
    }
    for (const trigger of def.triggers) {
      // S06: every trigger must declare how to dedupe its items, for the same reason actions must
      // declare idempotency — the engine will otherwise fire someone's automation twice.
      if (typeof trigger.dedupeKey !== "function") {
        throw new Error(`connector "${def.key}" trigger "${trigger.key}" is missing its dedupeKey`);
      }
    }
    this.connectors.set(def.key, def);
  }

  get(key: string): ConnectorDef | undefined {
    return this.connectors.get(key);
  }

  list(): ConnectorDef[] {
    return [...this.connectors.values()];
  }

  /** Serializable metadata for the API/UI — schemas introspected into field lists (S04 builds forms). */
  metadata() {
    return this.list().map((c) => ({
      key: c.key,
      name: c.name,
      version: c.version,
      deprecated: c.deprecated ?? false,
      actions: c.actions.map((a) => ({
        key: a.key,
        name: a.name,
        idempotency: a.idempotency.strategy,
        input: describeSchema(a.input),
      })),
      triggers: c.triggers.map((t) => ({ key: t.key, name: t.name, type: t.type })),
    }));
  }
}

interface FieldInfo {
  name: string;
  type: string;
  optional: boolean;
}

/** Minimal zod introspection: for an object schema, list its fields. Enriched into full form specs in S04. */
export function describeSchema(schema: ZodTypeAny): FieldInfo[] {
  if (!(schema instanceof ZodObject)) return [];
  const shape = schema.shape as Record<string, ZodTypeAny>;
  return Object.entries(shape).map(([name, field]) => ({
    name,
    type: (field._def as { typeName?: string }).typeName ?? "unknown",
    optional: field.isOptional(),
  }));
}
