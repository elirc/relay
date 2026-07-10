import { ExprRenderError } from "./errors";
import { tokenize, parsePath } from "./tokenizer";

/** The data a template resolves against: the trigger payload and prior step outputs. */
export interface Scope {
  trigger?: unknown;
  steps?: unknown[];
  [key: string]: unknown;
}

const REF_RE = /\{\{([^}]*)\}\}/g;

/**
 * Walk a path over the scope. A missing segment is a **render-time error**, not a silent empty string —
 * a mapping that points at nothing is a bug the author should see, not a blank that corrupts the run.
 */
export function resolvePath(path: string[], scope: Scope): unknown {
  let cur: unknown = scope;
  for (const seg of path) {
    if (cur === null || cur === undefined || typeof cur !== "object") {
      throw new ExprRenderError(`cannot resolve "${path.join(".")}": "${seg}" is not on an object`);
    }
    cur = (cur as Record<string, unknown>)[seg];
    if (cur === undefined) throw new ExprRenderError(`cannot resolve "${path.join(".")}": missing "${seg}"`);
  }
  return cur;
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Render a template against a scope.
 *
 * TYPE PRESERVATION: a template that is exactly one reference (`{{trigger.count}}`) returns the value
 * with its original type — a number stays a number, an array stays an array. A template with any
 * surrounding text (`"Count: {{trigger.count}}"`) coerces to a string. This distinction is product
 * quality: platforms that coerce everything to strings silently flatten `5` into `"5"` and arrays into
 * `"[object Object]"`, corrupting data one step downstream.
 */
export function render(template: string, scope: Scope): unknown {
  const tokens = tokenize(template); // validates the grammar; ExprParseError on anything non-path

  if (tokens.length === 1 && tokens[0].kind === "ref") {
    return resolvePath(tokens[0].path, scope);
  }

  let result = tokens
    .map((t) => (t.kind === "text" ? t.value : stringify(resolvePath(t.path, scope))))
    .join("");

  // Resolve references that appear inside resolved values, too, so nested templates fill in.
  let prev = "";
  while (result !== prev && result.includes("{{")) {
    prev = result;
    result = result.replace(REF_RE, (_, inner) => stringify(resolvePath(parsePath(inner), scope)));
  }
  return result;
}
