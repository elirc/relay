# Runbook: queue backlog

**Symptom:** queue depth growing in a lane (`queueDepthByLane`).

## Checks
1. **Which lane?** A bulk-lane backlog behind a huge fan-out is often fine (it has a reserved minimum and
   won't starve interactive — S11). An *interactive* backlog is a real problem (humans waiting).
2. **Root cause:** a stuck connector (see [stuck-runs.md](stuck-runs.md))? A deploy that dropped worker
   capacity? A traffic spike?

## Fix
- Stuck connector → the breaker + DLQ path handles it.
- Capacity → scale workers; the fair scheduler (S11) keeps tenants isolated as capacity returns.
- Spike → the priority lanes protect interactive runs; let bulk drain behind its reserved minimum.

## Do NOT
- Do **not** flip everything to the interactive lane to "clear the backlog" — you'd defeat fairness and
  let one tenant's bulk work starve everyone.
