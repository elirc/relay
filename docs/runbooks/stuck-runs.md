# Runbook: stuck runs (a hung vendor pileup)

**Symptom:** runs for one connector stop finishing; worker fleet saturates; other connectors' runs queue.

## Cause model
A vendor *hangs* (not an error — a socket that never responds). Steps wait past their budget; enough of
them consume the fleet. This is the S15 drill scenario.

## Checks
1. **Which connector?** `EngineMetrics` failure/latency breakdown by connector. One vendor's p95 will be
   pegged. That's your culprit.
2. **Is the circuit breaker open for it?** If open, it's already holding that connector's runs — good, the
   fleet is protected. If not, the threshold may be too high (postmortem action item).
3. **Queue depth by lane** — is the backlog isolated or spreading?

## Fix
1. The breaker should auto-open on the degraded connector; stuck runs auto-timeout to **retriable-failed**
   and land in the DLQ. Let the mechanism work.
2. Once the vendor recovers, the breaker's half-open probe closes it; **bulk-replay the DLQ**
   ([dlq-triage.md](dlq-triage.md)) — safe because of idempotency keys.

## Do NOT
- Do **not** blindly retry stuck runs into the still-hung vendor — you amplify the pileup.
- Do **not** kill runs as "failed" — retriable-failed preserves them for replay; a hard fail loses
  legitimately-slow runs.
