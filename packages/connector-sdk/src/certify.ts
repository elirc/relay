import { ZodObject } from "zod";
import type { ConnectorDef } from "./connector";

/**
 * The connector certification harness (S14). An ecosystem needs a **gate, not goodwill**: a connector
 * passes conformance or it doesn't ship. This harness encodes every lesson of the course as an automated
 * check — so "a real connector" has a definition you can run, not a vibe. It is the S03 contract tests
 * grown into the rubric a stranger's connector (the learner's) is graded against.
 *
 * Two severities:
 *  - **safety** — non-negotiable (idempotency declared, dedupe key present, auth declared, valid semver).
 *    A connector that fails any safety check cannot ship in ANY tier.
 *  - **quality** — polish (object schemas, base path). First-party connectors must pass these; a
 *    clearly-labeled community tier may ship with quality gaps but NEVER with safety gaps.
 */
export interface CertFinding {
  severity: "safety" | "quality";
  check: string;
  message: string;
}

export interface CertResult {
  key: string;
  version: string;
  strictPass: boolean; // no findings at all (first-party bar)
  safetyPass: boolean; // no safety findings (community-tier bar)
  findings: CertFinding[];
}

const SEMVER = /^\d+\.\d+\.\d+$/;

export function certifyConnector(def: ConnectorDef): CertResult {
  const findings: CertFinding[] = [];
  const safety = (check: string, message: string) => findings.push({ severity: "safety", check, message });
  const quality = (check: string, message: string) => findings.push({ severity: "quality", check, message });

  if (!SEMVER.test(def.version)) safety("semver", `version "${def.version}" is not semver`);
  if (def.auth?.type !== "header") safety("auth", "connector must declare a header auth scheme");
  if (!def.basePath) quality("base-path", "missing basePath");

  for (const action of def.actions) {
    if (!action.idempotency) safety("idempotency", `action "${action.key}" is missing its idempotency declaration`);
    if (!(action.input instanceof ZodObject)) quality("input-schema", `action "${action.key}" input is not an object schema`);
    if (!(action.output instanceof ZodObject)) quality("output-schema", `action "${action.key}" output is not an object schema`);
  }
  for (const trigger of def.triggers) {
    if (typeof trigger.dedupeKey !== "function") safety("dedupe-key", `trigger "${trigger.key}" is missing its dedupeKey`);
  }

  const safetyPass = !findings.some((f) => f.severity === "safety");
  return { key: def.key, version: def.version, strictPass: findings.length === 0, safetyPass, findings };
}
