/**
 * Redact known secret strings from a value before it's stored or rendered in run history (S05).
 *
 * Run payloads are the user's primary debugging surface — they inspect the exact inputs/outputs of each
 * step. But connection access tokens ride inside the contexts those steps touch, and a token rendered in
 * a history view is a token leaked to anyone who can see the run. So before persisting/serving a payload,
 * we mask any occurrence of the connection's secrets. We only redact reasonably long strings so a short
 * secret can't cause us to mask innocuous text everywhere.
 */
const PLACEHOLDER = "«redacted»";
const MIN_SECRET_LEN = 6;

export function redactSecrets<T>(value: T, secrets: readonly string[]): T {
  const active = secrets.filter((s) => typeof s === "string" && s.length >= MIN_SECRET_LEN);
  if (active.length === 0) return value;

  const scrub = (v: unknown): unknown => {
    if (typeof v === "string") {
      let out = v;
      for (const secret of active) out = out.split(secret).join(PLACEHOLDER);
      return out;
    }
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === "object") {
      const obj: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) obj[k] = scrub(val);
      return obj;
    }
    return v;
  };

  return scrub(value) as T;
}
