# Relay Flaw Ledger (author-private until Sprint 13 recap)

| # | Planted in | What | Where | Harvested in | Status |
|---|-----------|------|-------|--------------|--------|
| 1 | S04 | Expression rendering does naive string interpolation into action inputs — a step output containing `{{…}}` gets re-expanded (template injection) | packages/expr render | S13 (fuzz finds it; single-pass render + output-as-data rule) | planned |
| 2 | S05 | Step outputs stored inline as JSONB on StepRun rows — multi-MB vendor responses bloat the runs table | engine persistence | S10 (offload to object storage with size threshold; table size before/after) | planned |
| 3 | S06 | Polling cursor stored per relay, not per connection+trigger — two relays on one sheet poll twice and can double-trigger | trigger scheduler | S11 (shared trigger subscriptions; dedupe evidence) | planned |
| 4 | S06 | Inbound trigger webhooks accept unsigned payloads (no HMAC verification against vendor farm signatures) | webhook receiver | S13 (replay/forgery probe; signature + timestamp window) | planned |
| 5 | S09 | Sandbox console.log output captured unbounded — a logging loop can OOM the engine worker | code-step runner | S13 (output caps + truncation markers; the lab's poison pill) | planned |

**In-PR arcs (planted and fixed inside one PR by design):**
S02 OAuth refresh race (two steps refresh one token concurrently → one revoked) → per-connection mutex · S05 engine crash mid-run → duplicate vendor email sent → the S7 flagship reruns this exact scenario with checkpoints · S07 resume-replays a completed side effect → idempotency-strategy enforcement · S08 cycle submitted via API → DAG validation.

**Rules:** never fix a ledger flaw silently; harvesting commits quote the ledger row and flip Status.
