import { ExprParseError } from "./errors";

/**
 * The expression grammar (S04) is deliberately TINY: a template is literal text interleaved with
 * `{{ dotted.path }}` references, and that's the entire language. No operators, no function calls, no
 * filters, no arithmetic. `{{steps.1.output.email}}` and `{{trigger.amount}}` are valid; `{{1 + 2}}`,
 * `{{upper(name)}}`, `{{a || b}}` are all rejected.
 *
 * Smallness is the security feature. This string language is the product's most-attacked API — users
 * paste untrusted data through it constantly. By making the grammar closed and path-only, the entire
 * injection surface is a path resolver over a fixed scope. Every operator we might add later (S10) is a
 * separate, deliberate security decision — not a default we have to walk back.
 */
export type Token =
  | { kind: "text"; value: string }
  | { kind: "ref"; path: string[]; raw: string };

// A path is an identifier followed by dot-separated identifiers/indices. Nothing else is legal.
const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$/;
const REF_RE = /\{\{([^}]*)\}\}/g;

/** Parse and validate the inside of a `{{ }}` into path segments, or throw ExprParseError. */
export function parsePath(inner: string): string[] {
  const trimmed = inner.trim();
  if (!PATH_RE.test(trimmed)) {
    throw new ExprParseError(
      `invalid expression "${inner.trim()}": v1 supports dotted paths only (no operators, functions, or spaces)`,
    );
  }
  return trimmed.split(".");
}

/** Split a template into literal-text and reference tokens. Throws on any malformed reference. */
export function tokenize(template: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(template)) !== null) {
    if (m.index > last) tokens.push({ kind: "text", value: template.slice(last, m.index) });
    tokens.push({ kind: "ref", path: parsePath(m[1]), raw: m[0] });
    last = m.index + m[0].length;
  }
  if (last < template.length) tokens.push({ kind: "text", value: template.slice(last) });
  return tokens;
}
