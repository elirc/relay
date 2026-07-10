# Runbooks

Operational playbooks for Relay in production. Written for whoever is paged at 3am and did **not** build
the system: symptom, checks in order, fix, and what NOT to do.

> **Golden rule:** the `MutationLog`... no — this is Relay. **Runs are durable; the queue is work.** A
> stuck or lost job is recoverable from the checkpointed run. Almost no incident is worth touching run
> checkpoints. When in doubt, drain and let runs *resume*, never re-run blindly.

| Runbook | Symptom |
|---------|---------|
| [stuck-runs.md](stuck-runs.md) | Runs pile up; a connector's steps never finish |
| [dlq-triage.md](dlq-triage.md) | Dead-lettered runs accumulating; need to inspect + bulk-replay |
| [vendor-outage.md](vendor-outage.md) | One vendor is down/degraded; its connector's runs failing |
| [queue-backlog.md](queue-backlog.md) | Queue depth growing in a lane |
| [restore.md](restore.md) | Restoring runs/checkpoints/connections (incl. the KEK trap) |
| [rollback.md](rollback.md) | A bad deploy must be reverted |

## Escalation
- **P1** (fleet-wide degradation, data at risk): page on-call, open an incident channel, start a timeline,
  write a blameless postmortem after (`docs/postmortems/`).
- **P2** (one connector degraded, others fine): fix, file follow-ups as issues.

## After every incident
Write the postmortem the same day, blameless. The headline question: *did we get paged before the
customer noticed, and if not, which threshold was too slow?* (That question turned the S15 vendor-hang
drill into real alerting improvements.)
