# Runbook: DLQ triage + bulk replay

**Symptom:** dead-lettered (retriable-failed) runs accumulating after a vendor incident.

## Why bulk replay is SAFE here
Every side effect carries an idempotency key (S07). Replaying 10,000 dead-lettered runs after a fix
produces **zero duplicate side effects** — the vendor dedupes on the key. Without that investment, DLQ
replay would be Russian roulette. This is the durable-execution payoff at ops scale.

## Steps
1. Inspect the DLQ; **categorize by error class + connector** (the metrics breakdown). Confirm the root
   cause is fixed (e.g. vendor recovered, breaker closed).
2. Bulk-replay the affected category (dry-run a sample first). Replay is checkpoint-resume with a fresh
   run id; completed steps rehydrate, only the failed tail re-runs.
3. Watch failure rate — if it climbs again, the cause isn't fixed; stop and re-diagnose.

## Do NOT
- Do **not** bulk-replay before confirming the cause is fixed — you'll just re-fill the DLQ.
- Do **not** disable idempotency to "speed up" replay — that's the one thing making replay safe.
