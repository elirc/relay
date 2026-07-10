# Runbook: backup & restore

**Runs, checkpoints, and connections are the crown jewels.** Back them up like it.

## The KEK trap (read this first)
Connection tokens are envelope-encrypted (ADR-0004). **A restored database without its master KEK is
landfill** — the wrapped DEKs won't unwrap, so no connection can decrypt its tokens, so no relay can call
a vendor. Encrypted backups are only as recoverable as their key custody.

## Restore drill (staging, every release)
1. Restore the DB snapshot to fresh staging.
2. **Confirm the KEK for that snapshot's era is available** (KMS/secret store). Without it, stop — you
   have data you cannot use.
3. Smoke test: a connection decrypts (`open`s a token); a relay runs a step against the farm.
4. If checkpoints were restored to a point behind in-flight runs, those runs resume from the restored
   checkpoint — idempotency keeps a re-executed step from duplicating (S07).

## Do NOT
- Do **not** rotate or retire a KEK you might need to restore an old backup with — key custody spans your
  entire backup-retention window (see the KEK rotation runbook).
