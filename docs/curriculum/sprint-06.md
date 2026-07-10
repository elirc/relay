# Curriculum Note — Sprint 6: Triggers at scale

## Learning objectives
- Build the **three trigger species** (polling, managed webhooks, schedules) and their distinct hazards.
- Make **dedupe a discipline**: connector declares item identity, engine enforces it with a bounded window.
- Reconcile **distributed subscription state** without trusting either side.
- See scheduling as an ops problem: **stagger** to avoid herds, **misfire policy** as a user decision.

## Key concepts
- **Dedupe: declare identity, enforce dedupe.** Only the connector knows what makes two events the same
  item (a row id, a message-id, a content hash for vendors with nothing). So every trigger declares
  `dedupeKey`, and the registry rejects one that doesn't — the same split of labor as action idempotency
  (S3). The engine's `Deduper` enforces it. (ADR-0008.)
- **TTL windows are a reasoned bound, not a magic number.** Dedupe state can't grow forever. The window
  must be at least as long as the farthest apart two duplicates can arrive — for polling, roughly
  `interval × safety factor`, because a late poll re-surfaces an item about one cycle later. Too big
  wastes memory; too small lets a straggler duplicate through.
- **Stagger, or self-DDoS.** N thousand polling triggers on the round minute is both a self-inflicted
  load spike and a vendor-relations incident (every vendor sees a spike at :00). Hashing each trigger's
  offset by its id spreads them deterministically across the window — same trigger, same slot, debuggable.
- **Reconcile mutually untrusted witnesses.** Managed webhook subscriptions drift: a deregister fails and
  the vendor keeps sending; a vendor expires a sub we think is live; a crash lands between our DB write
  and the vendor call. A sweep converges the two sets — register what we want but the vendor lacks,
  deregister vendor orphans — trusting neither as ground truth.
- **Misfire policy belongs to the user.** When the engine is down across scheduled ticks, "skip"
  (default) protects against a 3-day outage becoming a 4,000-run stampede on recovery; "runOnce"
  collapses the backlog to a single catch-up for relays that must not miss. This is an infrastructure
  decision that's genuinely the user's to make — so we surface it rather than hard-coding it.
- **The SDK curve bends.** ChatBox is the third connector at ~90 lines, most of it two schemas and the
  `dedupeWindow` idempotency (it has no idempotency header and no natural key we control — the weakest
  strategy, chosen honestly).

## Planted debt (find it)
- **Flaw #3:** the polling cursor is keyed **per relay**, not per connection+trigger. Two relays polling
  the same sheet keep separate cursors and can both fire on a shared new row (harvest S11).
- **Flaw #4:** the inbound webhook receiver accepts payloads without verifying the vendor's HMAC
  signature — the farm signs everything (S02), and we verify nothing. Anyone who learns a binding URL can
  forge trigger events (harvest S13). *The `webhookSecret` we store is a hint: verification was intended.*

## Exercise questions
1. Why must the connector, not the engine, own `dedupeKey`? Give a concrete pair of events a generic
   whole-payload hash would get wrong (both a false merge and a false split).
2. Derive the dedupe TTL from a 5-minute polling interval. What breaks if it's 10 seconds? If it's a week?
3. Walk the webhook reconcile sweep for: (a) a sub we deregistered but the vendor still has; (b) a sub
   the vendor dropped but we still expect. Why can't we trust either side alone?
4. Two of this sprint's changes are planted flaws. Name them and the exact line/behavior that's wrong.

## Debate
**Polling interval: fixed per plan vs. adaptive.** Resolved: fixed per tier (1/5/15 min); adaptive
documented with its explainability cost. *Predictability is a feature; adaptive systems must budget for
explaining themselves.*

## Further reading
- At-least-once delivery & idempotent consumers · Webhook subscription lifecycle & reconciliation ·
  Jitter/stagger for scheduled fan-out · Cron misfire semantics (Quartz) · Replay/forgery defense (S13)
