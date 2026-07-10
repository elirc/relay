# Postmortem: Vendor-hang stuck-run pileup — staging drill

- **Date:** 2026-07-09 (planned incident drill, staging)
- **Severity:** P1 (fleet-wide degradation — all connectors' runs delayed)
- **Status:** Resolved; action items filed
- **Authors:** Relay on-call (drill)

> **Blameless.** The subject is the *system* and the *thresholds*, never a person. We ran this drill so
> the first time we saw a vendor-hang pileup was not in production.

## Summary
We turned the vendor farm's latency knob to effectively infinite for MailPost mid-run. Steps calling
MailPost stopped responding and never returned; within minutes the worker fleet filled with stuck runs
and **runs for *other* connectors (SheetLite, ChatBox) started queueing** behind them. Stuck-run
detection did fire and the circuit breaker tripped — but **the alert threshold was too slow**, so on-call
would have learned about it minutes after customers felt it. That timing gap, not the mechanism, was the
finding.

## Impact
- ~6 minutes of fleet-wide run delay in the drill; healthy connectors' runs queued behind hung MailPost
  steps until the breaker tripped and the stuck lane drained.
- Zero data loss: stuck runs timed out to **retriable-failed** and were later **bulk-replayed** from the
  DLQ with no duplicate side effects (S07 idempotency).

## Timeline (staging)
- **T+0:00** — MailPost latency → ∞. Steps calling it hang.
- **T+1:30** — worker fleet saturating; other connectors' runs begin queueing.
- **T+3:00** — stuck-run detection fires; MailPost circuit breaker opens (holds its runs).
- **T+3:30** — stuck lane drained; healthy connectors recover. (Alert *would* have paged here — too late.)
- **T+6:00** — MailPost latency restored; breaker half-open probe succeeds, closes; DLQ bulk-replay clears
  the retriable-failed backlog.

## What went well
- The stuck-run → timeout → retriable-failed → breaker → DLQ → safe-replay chain worked end to end. The
  durable-execution and idempotency investments (S07) made the recovery *boring*, which is the goal.

## What went wrong
- **The alert threshold was too slow.** Detection worked; *notification* lagged the customer-visible
  impact. A mechanism that works but pages late is a mechanism that fails the customer.

## Root cause
Alert thresholds were tuned to mechanism correctness, not to customer-impact timing.

## Action items (filed as issues)
1. **Tighten stuck-run / queue-backlog alert thresholds** to fire on customer-visible symptom onset, not
   on breaker trip. *(shipped in S15 alerting)*
2. **Per-connector queue-depth alert** so one connector's pileup is visible before it starves others.
3. **Runbook: stuck runs / vendor outage** (`docs/runbooks/`).

## Lesson
Drills validate *thresholds*, not just *mechanisms*. Our detection was correct and our alert was late — a
drill that had changed no config would have "passed" and taught us nothing. Operating an automation engine
is watching one promise at scale: every run resumes correctly, and you get paged **before** the customer
notices.
