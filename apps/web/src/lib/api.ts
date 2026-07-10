const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Tiny fetch helper. `no-store` so run history is never stale — you're debugging, you want the truth. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}
