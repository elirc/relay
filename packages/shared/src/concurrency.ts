/**
 * Bounded-concurrency map (S10). Run `fn` over `items` with at most `limit` in flight at once, preserving
 * result order. Fan-out needs this: parallelism against someone else's API is a rate-limit incident in
 * waiting — 5,000 simultaneous calls will get you throttled or banned. This is a STATIC cap; S11 makes it
 * fair (per-vendor budgets, priority). Here it's the placeholder that keeps a fan-out from melting a vendor.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
