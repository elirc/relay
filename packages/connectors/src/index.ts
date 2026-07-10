import { Registry, type ConnectorDef } from "@relay/connector-sdk";
import { mailpost } from "./mailpost";
import { sheetlite } from "./sheetlite";
import { chatbox } from "./chatbox";
import { calendarlite } from "./calendarlite";

export { mailpost } from "./mailpost";
export { sheetlite } from "./sheetlite";
export { chatbox } from "./chatbox";
export { calendarlite } from "./calendarlite";

/** The built-in connectors, in registration order. CalendarLite (S14) is the learner-authored one. */
export const BUILTIN_CONNECTORS: ConnectorDef[] = [mailpost, sheetlite, chatbox, calendarlite];

/** Build a registry with all built-in connectors registered (and validated). */
export function buildRegistry(): Registry {
  const registry = new Registry();
  for (const c of BUILTIN_CONNECTORS) registry.register(c);
  return registry;
}
