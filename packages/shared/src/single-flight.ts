/**
 * Single-flight: collapse concurrent calls that share a key into ONE in-flight execution; every caller
 * awaits the same result. (Also called request coalescing or "dogpile" prevention.)
 *
 * This is the shape of the fix for the OAuth refresh race (S02). If two steps notice an expired access
 * token at the same instant, a naive client fires two refreshes. But refresh tokens ROTATE — the first
 * refresh revokes the token the second is about to present, so the second fails and can knock the whole
 * connection offline. Single-flight makes exactly one refresh run per connection; the other caller
 * awaits its result and gets the fresh token. Key it by connection id.
 */
export class SingleFlight<T> {
  private inflight = new Map<string, Promise<T>>();

  run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing; // a call for this key is already running — join it

    const p = (async () => {
      try {
        return await fn();
      } finally {
        // Clear only after settling, so late-arriving callers still join THIS run, and the NEXT call
        // (e.g. the next time the token expires) starts a fresh one.
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, p);
    return p;
  }
}
