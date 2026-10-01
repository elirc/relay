# Relay — local durable workflow studio

A JavaScript workflow runner built through Astra implementation, Sol adversarial review, and independent browser verification. The [build narrative](journal/READ-ME-FIRST.txt) follows the real design decisions, failures, fixes, and tests.

## Upskilling guides

Start with the [learning path](journal/LEARNING-PATH.txt), then work through:

- [Eight fictional user stories](journal/USER-STORY-WALKTHROUGHS.txt): implementation walkthroughs for versioning, crash recovery, leases, retries, cancellation, and proposed scheduling/webhook/graph extensions.
- [Architecture clinic](journal/ARCHITECTURE-CLINIC.txt): request and effect identity, failure matrices, checkpoint ordering, lease timing, retry limits, storage, and process ownership.
- [Practice workbook](journal/PRACTICE-WORKBOOK.txt): seven labs with answer guides, a local webhook capstone, and prompts for adversarial review roles.

Fictional review conversations are teaching examples. The original narrative and verification report preserve the actual build history and observed results.

## Run

Requires Node 22.16+ with `node:sqlite`.

```powershell
cd C:\Users\Owner\Desktop\astrafinalorganize\relay-rebuild
npm ci
npm start
```

Open **http://127.0.0.1:4319**. The start command launches the web app and a worker. Dependencies and compatible Chromium are already present on this laptop. The first launch seeds example workflows. Later launches preserve drafts, published versions, runs, checkpoints, and simulated provider receipts in `data/`.

The local operator login has no password. It is a learning environment, not production authentication. Notification steps use a **durable local mock provider**; no email, webhook, or real external service is contacted.

## Explore

- Build an ordered workflow from transform, wait, and simulated notification steps.
- Save the draft, publish an immutable version, then run it with text input.
- Inspect execution state, step outputs, retry/cancel behavior, and provider receipts.
- Edit and publish another version while older runs retain their original version.
- Restart the worker and observe persisted checkpoints rather than in-memory progress.

There is no arbitrary JavaScript, shell command, or URL execution. Outputs are bounded and persisted in SQLite. Cancellation prevents further eligible work but cannot undo an already-accepted notification effect.

A workflow can contain up to ten steps. Individual prefix/suffix fields allow up to 20,000 characters, within an aggregate 256 KB JSON request limit. Each serialized step output is limited to 64,000 UTF-8 bytes; character counts and byte counts differ for non-ASCII text.

## Verify

```powershell
npm run check
npm test
npm run test:browser
```

Tests use isolated databases and child processes. A fresh machine without a browser may need `npx playwright install chromium`. See [verification](journal/VERIFICATION.md) for exact results and limitations.

The key durability test crashes a worker **after** the separate mock provider commits a receipt but **before** the workflow checkpoint commits. A restarted worker retries with the same key; the cooperating provider returns the same effect, and the run resumes. This does not imply universal exactly-once effects with arbitrary real services.

## Separate processes

`npm run web` starts only the HTTP app; `npm run worker` starts a worker. Both must use the same `DB_PATH` and `PROVIDER_DB_PATH` when overriding defaults. `PORT` changes the web port. Lease/poll settings are described by the implementation and contract; the crash flag is for disposable test runs, not normal operation.

Stop all app and worker processes before backing up the full `data` directory. SQLite's experimental warning on Node 22.16 is expected. See [architecture](ARCHITECTURE.md), [API contract](CONTRACT.md), and [agent reviews](journal/reviews).

This local edition does not provide untrusted-code sandboxing, real integrations, distributed deployment, organization accounts, scheduled triggers, a graph editor, or production observability. Existing GitHub repositories and sibling rebuilds remain unchanged.
