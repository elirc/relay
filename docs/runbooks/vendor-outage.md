# Runbook: vendor outage / degradation

**Symptom:** one vendor's connector is failing or slow; `failuresByConnector` spikes for it.

## Checks
1. Confirm it's the vendor, not us: the failure is isolated to ONE connector; other connectors are
   healthy; the trace's vendor spans show the time is in the vendor call (+ governor wait), not our engine.
2. Check the circuit breaker state for that connector — open means we're already holding its runs.

## Fix
1. Let the breaker hold the vendor's runs (don't hammer a down vendor). Its runs time out to
   retriable-failed → DLQ.
2. When the vendor recovers (status page / breaker half-open probe succeeds), bulk-replay the DLQ.
3. If the vendor is down for hours, notify affected builders (their relays are delayed, not lost).

## Do NOT
- Do **not** raise our rate limits to "push through" a degraded vendor — you'll earn a ban (S11).
