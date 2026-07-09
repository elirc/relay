# Sprint 06 — Triggers at Scale: Polling, Webhooks & Schedules

**Branch:** `sprint-06/triggers` · **Size:** L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** The three trigger species: polling (with cursors and dedupe), managed webhooks (auto-subscribe on the vendor when a relay publishes), and schedules (cron). Trigger dedupe becomes its own discipline: a trigger that fires twice runs someone's automation twice.

## A — Issues
1. `Polling triggers: scheduler, per-trigger cursors, new-item detection + dedupe`
2. `Managed webhooks: auto-register/deregister subscriptions on vendors at publish/unpublish`
3. `Schedule triggers: cron expressions, timezone-aware`
4. `ChatBox connector (closes S3 deferral) — message-posted trigger, post-message action`

## B — Commits
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(engine): polling scheduler — BullMQ repeatable per polling trigger, staggered offsets` | stagger prevents the :00 thundering herd against vendors (🔗 Pulse's jitter lesson, scheduler-shaped) |
| 2 | `feat(engine): cursor store + new-item detection — [cursor keyed per relay]` | **[flaw #3]** two relays polling one sheet poll twice, can double-trigger on shared items (harvest S11) |
| 3 | `feat(engine): trigger dedupe — seen-item keys (trigger def's dedupeKey) with TTL window` | connector defs declare what makes an item unique (id, or content hash); the SDK grows a `trigger.dedupeKey` requirement — registry check updated |
| 4 | `feat(api): managed webhook subscriptions — register on publish, deregister on unpublish, reconcile job` | reconciliation sweep: orphaned vendor subscriptions (we deregistered but vendor kept sending / vice versa) — 🔗 the "poll is the guarantee" law from Meridian S9, now on the subscription itself |
| 5 | `feat(api): inbound trigger webhooks — per-binding URLs, payload → run enqueue` | **[flaw #4]** accepts unsigned payloads; the farm signs everything, we verify nothing (harvest S13) |
| 6 | `feat(engine): schedule triggers — cron parse/validate, org-timezone aware, misfire policy` | misfire (engine down at tick): run-once-on-recovery vs skip — per-relay setting, default skip; 🔗 Meridian S10's catch-up discussion, now user-configurable |
| 7 | `feat(connectors): chatbox — message-posted trigger (webhook), post-message action (dedupeWindow strategy)` | third connector: 90 lines; the SDK curve bends |
| 8 | `test(engine): polling dedupe under farm chaos — duplicate poll responses → single trigger fire` | |
| 9 | `test(engine): webhook reconcile — orphan detection both directions` | |
| 10 | `test(e2e): all three trigger species fire a demo relay` | |
| 11 | `docs: ADR-0008 trigger dedupe ownership (connector declares, engine enforces); curriculum note` | |

## C — Review order
Dedupe-key SDK requirement (3) → polling scheduler stagger (1) → webhook reconcile (4) → misfire policy (6).

## D — Teaching comments (~10)
- stagger — 📘 N thousand polling triggers on round minutes is a self-DDoS *and* a vendor-relations incident; offset hashing by trigger id
- dedupeKey in the def — 📘 only the connector knows item identity (SheetLite rows have ids; MailPost emails have message-ids; some vendors have nothing — content hash fallback); the engine enforces what the connector declares — 🔗 same division as idempotency strategies (S3)
- TTL windows — ⚠️ dedupe state can't grow forever; window size = how far apart duplicates can arrive; polling interval × safety factor, reasoned in code
- reconcile both directions — 📘 distributed subscription state drifts both ways; the sweep treats vendor and DB as mutually untrusted witnesses
- misfire as product setting — 🔍 review-lens: infrastructure decisions (catch-up semantics) sometimes belong to users; "skip" defaults protect against the 3-day-outage → 4,000-run stampede
- unsigned webhooks — *(silent — flaw #4; the farm's signatures go unverified and no test notices… yet)*

## E — Debate
**"Polling interval: fixed per plan vs adaptive?"** Fixed: predictable load and billing. Adaptive (back off idle triggers): efficient, spooky ("why was my trigger slow?"). **Resolution:** fixed per plan tier now (1min/5min/15min), adaptive documented with its explainability cost. Lesson: *predictability is a feature; adaptive systems must budget for explaining themselves.*

## F/G — Close
- Squash: `feat(sprint-06): polling, managed webhooks, schedules (closes #…)`
- Deferred: webhook payload batching, per-trigger health dashboards (S12).
- Ledger: flaws #3, #4 recorded.
- Recap idea: *triggers are promises about noticing — polling notices late, webhooks notice unreliably, and dedupe keeps both honest.*
