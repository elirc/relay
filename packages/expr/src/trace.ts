import { tokenize } from "./tokenizer";
import { resolvePath, type Scope } from "./render";

/**
 * Render a template AND record what each `{{ref}}` resolved to (S12) — "this `{{steps.0.output.email}}`
 * became `ada@corp.com`". This resolution trace is the highest-leverage debugging feature in a mapping
 * tool: the #1 support burden is "why did my mapping produce that?", and showing the value each
 * expression produced makes the answer self-evident. It's a **single pass** — a trace must show the
 * truth, so it never re-expands (unlike the convenience path in `render`).
 *
 * Tracing every render in production is too much (🔗 sampled tracing); this runs behind a per-run debug
 * flag and sampled otherwise.
 */
export interface TraceEntry {
  ref: string;
  value: unknown;
}

function safeResolve(path: string[], scope: Scope): unknown {
  try {
    return resolvePath(path, scope);
  } catch {
    return undefined; // a missing ref traces as undefined rather than throwing — you're debugging
  }
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function renderWithTrace(template: string, scope: Scope): { output: unknown; trace: TraceEntry[] } {
  const tokens = tokenize(template);
  const trace: TraceEntry[] = [];
  const resolve = (path: string[]): unknown => {
    const value = safeResolve(path, scope);
    trace.push({ ref: path.join("."), value });
    return value;
  };

  if (tokens.length === 1 && tokens[0].kind === "ref") {
    return { output: resolve(tokens[0].path), trace };
  }
  const output = tokens.map((t) => (t.kind === "text" ? t.value : stringify(resolve(t.path)))).join("");
  return { output, trace };
}
