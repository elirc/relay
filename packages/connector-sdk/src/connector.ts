import type { ZodType, ZodTypeAny } from "zod";
import type { ConnectorHttp, AuthScheme } from "./http";

/**
 * The idempotency declaration is MANDATORY on every action — this field is load-bearing for the whole
 * course. Any step that calls a vendor must say how a retry avoids a duplicate side effect, because in
 * S07 the engine WILL retry, and "send email" that runs twice is a bug the user feels. Three strategies:
 *
 *   vendorKey    — the vendor accepts an idempotency header; we send a stable key, the vendor dedupes.
 *                  (Best: the vendor guarantees it. MailPost supports `Idempotency-Key`.)
 *   naturalKey   — the vendor has NO idempotency support, so WE derive a stable key from the input
 *                  (e.g. a content hash) and dedupe before calling. The burden is on us. (SheetLite.)
 *   dedupeWindow — best effort: suppress duplicates seen within a time window. Weakest; use only when
 *                  neither of the above is possible.
 */
export type IdempotencyStrategy =
  | { strategy: "vendorKey"; header: string }
  | { strategy: "naturalKey"; key: (input: unknown) => string }
  | { strategy: "dedupeWindow"; windowMs: number };

export interface ConnectorLogger {
  info(message: string, data?: Record<string, unknown>): void;
}

export interface ConnectorContext {
  connection: { id: string; vendor: string; scopes: string[] };
  /** the ONLY way a connector may reach the network (auth, limits, normalization all live here) */
  http: ConnectorHttp;
  logger: ConnectorLogger;
  /** A stable key for THIS step attempt, supplied by the engine (S07). A `vendorKey` action forwards
   *  it as the vendor's idempotency header so a retry doesn't double-fire. */
  idempotencyKey?: string;
}

export interface ActionDef {
  key: string;
  name: string;
  input: ZodTypeAny;
  output: ZodTypeAny;
  idempotency: IdempotencyStrategy;
  execute: (ctx: ConnectorContext, input: unknown) => Promise<unknown>;
}

export interface TriggerDef {
  key: string;
  name: string;
  type: "polling" | "webhook";
  output: ZodTypeAny;
  /**
   * What makes an incoming item unique (S06). Only the connector knows: a SheetLite row has an `id`, a
   * MailPost email has a message-id, a ChatBox message has a `ts`; a vendor with nothing gets a content
   * hash. The ENGINE enforces dedupe (a trigger that fires twice runs someone's automation twice); the
   * CONNECTOR declares identity. Same division of labor as the idempotency strategies in S3.
   */
  dedupeKey: (item: unknown) => string;
}

export interface ConnectorDef {
  key: string;
  name: string;
  /**
   * Semver (S14). Third parties pin their relays to a connector version. Changing an action's schema in a
   * breaking way is a MAJOR bump; relays keep working on the version they pinned (S04 immutability,
   * ecosystem-scaled). `deprecated` starts the deprecation-window clock without breaking pinned relays.
   */
  version: string;
  deprecated?: boolean;
  auth: AuthScheme;
  /** path prefix under the vendor-farm root, e.g. "/mailpost" */
  basePath: string;
  actions: ActionDef[];
  triggers: TriggerDef[];
}

/**
 * Author an action with full generic typing — `input`/`output` schemas parameterize `execute`, so the
 * body is type-checked against the declared shapes — then type-erase for storage in the registry.
 */
export function defineAction<I, O>(a: {
  key: string;
  name: string;
  input: ZodType<I>;
  output: ZodType<O>;
  idempotency: IdempotencyStrategy;
  execute: (ctx: ConnectorContext, input: I) => Promise<O>;
}): ActionDef {
  return a as unknown as ActionDef;
}

export function defineConnector(def: ConnectorDef): ConnectorDef {
  return def;
}
