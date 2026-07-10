import { Registry, type ConnectorDef } from "@relay/connector-sdk";
import { mailpost } from "./mailpost";
import { sheetlite } from "./sheetlite";

export { mailpost } from "./mailpost";
export { sheetlite } from "./sheetlite";

/** The built-in connectors, in registration order. ChatBox arrives in S06 (it needs the trigger work). */
export const BUILTIN_CONNECTORS: ConnectorDef[] = [mailpost, sheetlite];

/** Build a registry with all built-in connectors registered (and validated). */
export function buildRegistry(): Registry {
  const registry = new Registry();
  for (const c of BUILTIN_CONNECTORS) registry.register(c);
  return registry;
}
