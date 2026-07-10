# Runbook: rollback a bad deploy

Default to rolling back FIRST, diagnosing after. A rollback is reversible; a debugging session in prod
while runs pile up is not.

## Preconditions that make rollback safe
- **Graceful drain (S07):** SIGTERM checkpoints in-flight runs and requeues them; the new/rolled-back
  instance resumes them from their last checkpoint with no duplicate side effects. Swapping versions is a
  controlled reconnect, not an outage.
- **Migrations are the exception:** code rolls back cleanly; a schema migration may not. Migrations must be
  backward-compatible (expand/contract).

## Steps
1. Roll the engine + api image back to the last known-good tag. Watch for the expected drain/resume blip.
2. Confirm failure rate and queue depth return to baseline.
3. If a migration shipped with the bad deploy, check backward compatibility before touching the schema
   (see [restore.md](restore.md) if a destructive migration ran).

## Do NOT
- Do **not** roll back a schema migration without checking backward compatibility — a `DROP COLUMN` isn't
  undone by deploying old code.
