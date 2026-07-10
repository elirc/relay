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

/** The storage key for a polling binding's cursor. */
export function cursorKey(binding: PollingBinding): string {
  return `cursor:${binding.relayId}`;
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
