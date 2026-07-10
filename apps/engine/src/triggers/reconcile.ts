/**
 * Managed-webhook subscription reconciliation (S06).
 *
 * We register a webhook subscription on the vendor when a relay publishes and deregister it when it
 * unpublishes. But that state drifts: a deregister call fails and the vendor keeps sending; a vendor
 * expires a subscription we still think is live; a crash lands between our DB write and the vendor call.
 * A periodic sweep treats the vendor and our DB as **mutually untrusted witnesses** and converges them:
 * register anything we should have but the vendor doesn't, deregister anything the vendor has but we
 * don't. (The "poll is the guarantee" instinct — reconciliation, not hope, keeps distributed state honest.)
 */
export interface ReconcilePlan {
  toRegister: string[];
  toDeregister: string[];
}

export function reconcile(desired: Iterable<string>, actual: Iterable<string>): ReconcilePlan {
  const want = new Set(desired);
  const have = new Set(actual);
  return {
    toRegister: [...want].filter((k) => !have.has(k)), // we should have it; vendor doesn't
    toDeregister: [...have].filter((k) => !want.has(k)), // vendor has it; we don't want it (orphan)
  };
}
