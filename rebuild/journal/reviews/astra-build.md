# Astra build journal — Relay

## What I built

Relay is a local JavaScript workflow studio with an Express web process, a separate worker process, an app SQLite database, and a separate durable mock-provider SQLite database. The implementation covers editable declarative drafts, immutable publication, pinned runs, inline output checkpoints, leases, retries, cancellation, a provider receipt inbox, and a responsive browser interface. No arbitrary JavaScript, shell commands, URLs, or external services are accepted as workflow configuration.

## Decisions made during the build

- A draft is a compare-and-swap record. Saving and publishing require its current revision. Publication captures the step list in a transaction and inserts an immutable version row; SQL triggers reject later version updates and deletes. Runs retain the published version number and workflow name from creation.
- Workers claim a run under `BEGIN IMMEDIATE` and receive a random fencing token with an expiry. Renewal, checkpoint, failure, and final success writes verify both that token and an unexpired running state. Cancellation removes the token. Default wall-clock readings happen after the database write lock is acquired, so a wait for that lock cannot validate a lease using stale pre-lock time. Tests can supply an explicit clock value for deterministic fencing checks.
- The worker starts from the ordered `run_steps` checkpoints. Step output remains inline as a `{text}` object, with a 64,000-byte bound on its UTF-8 JSON representation. This avoids pretending that an in-memory blob is durable. A wait interrupted before its checkpoint starts its bounded wait again; completed steps do not restart.
- Notification acceptance commits to a different SQLite database before the app checkpoint. The provider deduplicates the stable `runId:stepIndex` key and checks that replayed content matches. `CRASH_AFTER_EFFECT_ONCE=1` exits the worker with code 86 precisely between those commits. This is a durable adapter simulation, not a claim of universal exactly-once delivery to real network providers.
- `TRANSIENT_FAILURES` is a worker-only practice/test flag. Retry counters and the next retry time live in the app database, with bounded automatic retry and exponential delay. A manual retry preserves finished checkpoints and total attempts while resetting the automatic-failure budget. Cancelled runs cannot be retried.
- Replaying a run request key compares the explicit request intent, workflow ID plus input. It returns the original run even if a later publication now exists. A changed explicit intent receives 409.
- The supervisor starts both web and worker and sends graceful IPC shutdown before its forced-stop fallback. Both children disconnect their IPC channels after closing resources; this matters on Windows, where a referenced IPC channel can keep an otherwise-finished child alive.
- Browser requests use a Relay-specific HttpOnly, SameSite cookie and a custom same-origin write header. Hostnames are restricted to loopback. Server-side sessions expire after seven days; cookie lifetime alone is insufficient. HTTP JSON bodies have a 256 KB aggregate cap, independently of individual field limits.

## Interface rationale

The studio uses a dark ink sidebar and muted lavender controls, with compact workflow previews and a separate run audit trail. The editor exposes the actual declarative configuration: names, prefixes, suffixes, and bounded waits. Add, remove, and reorder controls work with a keyboard. Published version history remains visible beside the draft, and the Run dialog explicitly says it uses the latest published version rather than unsaved draft changes.

Polling never rerenders an active draft or an open dialog. Navigation reads use identity tokens to reject late responses. A 409 leaves the user's draft intact and requires an explicit load of the latest server draft. Writes disable duplicate actions. Native dialogs contain focus and prevent dismissal during their pending writes. Session expiry opens a reconnect dialog without discarding the existing draft or silently replaying a write. A wait duration left blank stays blank after reordering, so required validation cannot accidentally turn it into a zero-length wait.

Progress comes from the run status, persisted checkpoints, and audit events. Pending steps are not fabricated successes. The worker's next unfinished step is labeled as awaiting a checkpoint rather than given an invented percentage. Provider receipts and cancellation copy explicitly identify the local simulation and acknowledge that already-accepted or in-flight effects cannot be undone.

## Real review exchanges and verification

- I ran `npm run test:core`: both tests passed, covering real HTTP create/publish/run, actual checkpoints/provider receipt, immutable-version triggers, and deterministic stale-token rejection.
- Sol independently reported all nine adversarial/durability tests passing. The observed fault worker exited with 86 after provider acceptance, then another worker reclaimed the run on attempt 2 with one receipt and the original first checkpoint unchanged. Their journal and tests hold the detailed evidence.
- Root identified server-side session ageing, SQLite startup timeout order, and graceful IPC disconnection as areas needing attention. I added the lifetime checks, established the busy timeout before WAL setup, and disconnected both child channels after shutdown. Root reported the supervisor lifecycle test passing on a fresh database.
- Sol's UI source review found an expired-session recovery gap and a blank numeric field being coerced to zero on rerender. I fixed both. These were source-reasoned findings; I do not describe them as browser observations.
- `npm run check` syntax-checks source, public, scripts, and test JavaScript files. It passed after the UI implementation. Root owns the integrated browser test and visual evidence; those results are recorded separately.
- The combined `npm test` run subsequently passed all 12 tests, including Sol's independent tests, my core checks, and Root's supervisor lifecycle check.

## Explicit limits

This is one local passwordless workspace, not production authentication or a tenant isolation design. The mock provider is a durable adapter, not a real remote service. There is no arbitrary user code, file output, branching, secret storage, or external transport. A process stopping during an unfinished wait repeats that wait after lease recovery. Lists return the latest 200 runs/receipts. Field maxima do not override the total 256 KB request cap. The worker's default automatic transient-failure budget is three attempts; repeated process crashes are lease recovery rather than a claim of bounded successful completion.
