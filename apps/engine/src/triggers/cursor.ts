/**
 * Polling cursors + new-item detection (S06). A polling trigger remembers the newest item it has seen;
 * each poll returns items, and we emit only those newer than the cursor, then advance it.
 */
export interface PollingBinding {
  relayId: string;
  connectionId: string;
  connector: string;
  triggerKey: string;
}

/**
 * The identity of a polling subscription (S11, flaw #3 harvest). Originally the cursor was keyed by
 * **relay** — so two relays watching the SAME sheet kept independent cursors, polled the vendor twice,
 * and could both fire on a shared new row. The identity of a subscription is the RESOURCE being watched —
 * `(connection, connector, trigger)` — never the relay. Re-keying to the resource means one poll, one
 * cursor, shared across every relay bound to it; getting the identity right dissolves the duplication.
 */
export function subscriptionKey(binding: PollingBinding): string {
  return `sub:${binding.connectionId}:${binding.connector}:${binding.triggerKey}`;
}

/** The cursor is stored per subscription (per resource), so relays sharing a resource share one cursor. */
export function cursorKey(binding: PollingBinding): string {
  return `cursor:${subscriptionKey(binding)}`;
}

/**
 * Given items ordered newest-first and the id of the newest item seen last time, return the items that
 * are new (everything before the cursor) and the cursor to store next.
 */
export function detectNewItems<T extends { id: string }>(
  items: T[],
  lastSeenId: string | null,
): { fresh: T[]; nextCursor: string | null } {
  if (!lastSeenId) return { fresh: items, nextCursor: items[0]?.id ?? null };
  const idx = items.findIndex((i) => i.id === lastSeenId);
  const fresh = idx === -1 ? items : items.slice(0, idx);
  return { fresh, nextCursor: fresh[0]?.id ?? lastSeenId };
}
