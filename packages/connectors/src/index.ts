import { Registry, type ConnectorDef } from "@relay/connector-sdk";
import { mailpost } from "./mailpost";
import { sheetlite } from "./sheetlite";
import { chatbox } from "./chatbox";

export { mailpost } from "./mailpost";
export { sheetlite } from "./sheetlite";
export { chatbox } from "./chatbox";

/** The built-in connectors, in registration order. */
export const BUILTIN_CONNECTORS: ConnectorDef[] = [mailpost, sheetlite, chatbox];

/** Build a registry with all built-in connectors registered (and validated). */
export function buildRegistry(): Registry {
  const registry = new Registry();
  for (const c of BUILTIN_CONNECTORS) registry.register(c);
  return registry;
}
