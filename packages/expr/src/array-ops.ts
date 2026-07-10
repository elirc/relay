/**
 * Array operations for expressions (S10). Real data is arrays, so the expression layer grows helpers:
 * length, sum, slice, join, map-to-a-field, filter-by-field. Like the S08 conditions, these are exposed
 * as **named operations over data**, not as a string language the user types — no eval.
 *
 * ⚠️ Each op is bounded. A user expression over an array is unbounded compute: `map` over a million-item
 * collection is a denial-of-service on ourselves. `MAX_COLLECTION_SIZE` caps every op at the door — the
 * expression-shaped cousin of a cardinality guard. Grammar growth is always a cost review, not just a
 * security review.
 */
export const MAX_COLLECTION_SIZE = 10_000;

function asBoundedArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("expected an array");
  if (value.length > MAX_COLLECTION_SIZE) {
    throw new Error(`collection too large: ${value.length} > ${MAX_COLLECTION_SIZE} (cost guard)`);
  }
  return value;
}

export function arrayLen(value: unknown): number {
  return asBoundedArray(value).length;
}

export function arraySum(value: unknown): number {
  return asBoundedArray(value).reduce<number>((acc, x) => acc + Number(x), 0);
}

export function arraySlice(value: unknown, start: number, end?: number): unknown[] {
  return asBoundedArray(value).slice(start, end);
}

export function arrayJoin(value: unknown, sep: string): string {
  return asBoundedArray(value).map((x) => String(x)).join(sep);
}

/** Pluck a field from each element (map to a field). */
export function arrayMapField(value: unknown, field: string): unknown[] {
  return asBoundedArray(value).map((x) => (x as Record<string, unknown> | null)?.[field]);
}

/** Keep elements whose `field` equals `equals`. */
export function arrayFilterEq(value: unknown, field: string, equals: unknown): unknown[] {
  return asBoundedArray(value).filter((x) => (x as Record<string, unknown> | null)?.[field] === equals);
}
