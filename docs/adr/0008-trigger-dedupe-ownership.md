# ADR-0008: Trigger dedupe — the connector declares identity, the engine enforces it

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S06
- **Deciders:** Relay authors

## Context
Triggers notice the world imperfectly. Polling re-sees items across cycles; a vendor can deliver the
same webhook twice; a retry re-posts. A trigger that fires twice runs someone's automation twice — a
duplicate email, a duplicate charge. So trigger events must be deduplicated. But *what makes two events
the same item* is vendor-specific: SheetLite rows have ids, MailPost emails have message-ids, ChatBox
messages have a `ts`, and some vendors offer nothing.

## Decision
Split the responsibility, exactly as we did for action idempotency (S03):
- **The connector declares identity.** Every trigger definition carries a `dedupeKey(item) => string`.
  Only the connector knows the vendor's notion of "same item" (an id, a message-id, or a content hash
  fallback). The registry rejects a trigger with no `dedupeKey` at boot.
- **The engine enforces dedupe.** A `Deduper` with a TTL window records seen keys; a repeat within the
  window doesn't fire. The window is `interval × safety factor`, because a late poll can re-surface an
  item roughly one cycle later. Dedupe state is bounded (TTL eviction) — it must never grow forever.

Subscription state (managed webhooks) is kept honest by **reconciliation**, treating the vendor and our
DB as mutually untrusted witnesses. Scheduling uses **fixed intervals per plan tier** with a per-relay
**misfire policy** (default `skip`) so a multi-day outage doesn't stampede thousands of catch-up runs.

## Alternatives considered
- **Engine-owned identity (a generic dedupe key, e.g. hash the whole payload).** Simple, but wrong:
  two genuinely different events can hash-collide on irrelevant fields, and the same logical item can
  hash differently across polls (a field the vendor mutates). Identity is domain knowledge; only the
  connector has it.
- **No dedupe (at-least-once, let the user's automation be idempotent).** Pushes the hardest problem
  onto every user of every relay. Unacceptable — the platform must not fire twice by default.
- **Unbounded seen-set.** Correct but a memory leak; the TTL window is the honest bound, and its size is
  a reasoned function of the polling interval, not a magic number.

## Consequences
- Adding a connector means declaring one more `dedupeKey` — cheap, and the registry enforces it.
- Dedupe is only as good as the connector's key; a bad key (too coarse) merges distinct items, a bad
  window (too short) lets stragglers through. Both are connector/config review items.
- **Planted debt (ledger):** the polling cursor is currently keyed **per relay**, so two relays polling
  the same sheet keep independent cursors and can both fire on a shared new row (harvest S11). And the
  inbound webhook receiver does not yet verify the vendor's HMAC signature (harvest S13).

## Links
- `packages/connector-sdk/src/connector.ts` (`TriggerDef.dedupeKey`), `apps/engine/src/triggers/`,
  `apps/api/src/routes/webhooks.ts`, ADR-0005 (idempotency strategies), `docs/sprints/sprint-06.md`
