/**
 * Payload offloading (S10) — the harvest of flaw #2 (step outputs stored inline as JSONB).
 *
 * Databases are bad blob stores. A multi-MB vendor response inlined into a `StepRun` row bloats the OLTP
 * runs table, slows every query that touches it, and blows up backups — invisible until payloads got
 * real. The fix: above a size threshold, the *bytes* go to object storage and only a small **ref** stays
 * in Postgres (still queryable). Rehydration (S07's "return stored output, don't re-execute") now spans
 * storage: an expression that touches an offloaded output fetches it lazily.
 */
export interface ObjectStore {
  put(key: string, body: string): Promise<void>;
  get(key: string): Promise<string | null>;
}

/** In-memory store for tests/dev. Production uses S3/GCS/minio behind the same interface. */
export class MemoryObjectStore implements ObjectStore {
  private map = new Map<string, string>();
  async put(key: string, body: string): Promise<void> {
    this.map.set(key, body);
  }
  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
}

export const DEFAULT_OFFLOAD_THRESHOLD = 64 * 1024; // 64 KB — small enough to keep rows lean

/** Serialized size in characters (~bytes for typical payloads) — the threshold input. */
export function serializedSize(value: unknown): number {
  return JSON.stringify(value ?? null).length;
}

export function shouldOffload(value: unknown, threshold = DEFAULT_OFFLOAD_THRESHOLD): boolean {
  return serializedSize(value) > threshold;
}

/** A persisted output is either inline (small) or a ref to object storage (large). */
export type StoredOutput =
  | { kind: "inline"; value: unknown }
  | { kind: "ref"; ref: string; size: number };

export async function storeOutput(
  store: ObjectStore,
  key: string,
  value: unknown,
  threshold = DEFAULT_OFFLOAD_THRESHOLD,
): Promise<StoredOutput> {
  const size = serializedSize(value);
  if (size <= threshold) return { kind: "inline", value };
  await store.put(key, JSON.stringify(value)); // the bytes leave Postgres
  return { kind: "ref", ref: key, size }; // only this stays in the row
}

export async function loadStoredOutput(store: ObjectStore, stored: StoredOutput): Promise<unknown> {
  if (stored.kind === "inline") return stored.value;
  const raw = await store.get(stored.ref); // lazy fetch — only when something actually reads it
  return raw === null ? null : JSON.parse(raw);
}
