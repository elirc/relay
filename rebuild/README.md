# Relay — local durable workflow studio

A JavaScript workflow runner built through Astra implementation, Sol adversarial review, and independent browser verification. The [build narrative](journal/READ-ME-FIRST.txt) follows the real design decisions, failures, fixes, and tests. This is part three of a three-project course — see the [curriculum overview](../CURRICULUM.md).

## Upskilling guides

Start with the [learning path](journal/LEARNING-PATH.md), then work through:

- [Eight fictional user stories](journal/USER-STORY-WALKTHROUGHS.md): implementation walkthroughs for versioning, crash recovery, leases, retries, cancellation, and proposed scheduling/webhook/graph extensions.
- [Architecture clinic](journal/ARCHITECTURE-CLINIC.md): request and effect identity, failure matrices, checkpoint ordering, lease timing, retry limits, storage, and process ownership.
- [Practice workbook](journal/PRACTICE-WORKBOOK.md): eight labs with answer guides, implementation tiers, a local webhook capstone, and prompts for adversarial review roles.
- [Review fixes as diffs](journal/diffs/review-fixes.md): the blank-wait and expired-session findings reconstructed as study-able changes.

Fictional review conversations are teaching examples. The original narrative and verification report preserve the actual build history and observed results.

## Read the implementation

The backend carries short comments at its invariant points (lease fencing, clock-after-lock, provider idempotency keys, the crash flag's exact position): [src/store.js](src/store.js), [src/worker.js](src/worker.js), [src/app.js](src/app.js), [scripts/start.js](scripts/start.js). The browser studio is plain ES modules with no build step, loaded from [public/app.js](public/app.js) (event wiring, polling, boot):

- [public/api.js](public/api.js) — the one fetch wrapper and the expired-session gate
- [public/state.js](public/state.js) — application state and the page/refresh/session identity tokens
- [public/dom.js](public/dom.js) — markup helpers, escaping, formatting
- [public/session.js](public/session.js) — login and the session reconnect dialog
- [public/views.js](public/views.js) — shell, overview, workflows, runs, receipts, background refresh
- [public/editor.js](public/editor.js) — draft editing, dirty tracking, compare-and-swap save/publish, conflict recovery
- [public/dialogs.js](public/dialogs.js) — create-workflow and start-run dialogs (run key lifecycle)

## Run

Requires Node 22.16+ with `node:sqlite`.

```powershell
cd rebuild        # from the repository root; it was built in a standalone folder named relay-rebuild
npm ci
npm start
```

Open **http://127.0.0.1:4319** (default from `src/server.js:2`; override with `PORT`). `npm start` runs `scripts/start.js`, which launches the web app and a worker. Playwright (for `npm run test:browser`) may need `npx playwright install chromium` on a fresh machine. The first launch seeds example workflows. Later launches preserve drafts, published versions, runs, checkpoints, and simulated provider receipts in `data/`.

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

`npm run test:browser` now runs the original ten workflow scenarios plus [tests/ui-races.mjs](tests/ui-races.mjs), a delayed-response race suite added with the 2026-10-01 upskilling expansion (stale run/draft responses, pending-write locks, session expiry mid-save). The verification report documents the original build's evidence; the race suite is additional coverage, not part of that record. Test runs regenerate `test-results/`; the preserved record of the original build lives in `journal/evidence/`. `.github/workflows/ci.yml` runs all three commands on GitHub when this folder is pushed as its own repository.

The key durability test crashes a worker **after** the separate mock provider commits a receipt but **before** the workflow checkpoint commits. A restarted worker retries with the same key; the cooperating provider returns the same effect, and the run resumes. This does not imply universal exactly-once effects with arbitrary real services.

## Separate processes

`npm run web` starts only the HTTP app; `npm run worker` starts a worker. Both must use the same `DB_PATH` and `PROVIDER_DB_PATH` when overriding defaults. `PORT` changes the web port. Lease/poll settings are described by the implementation and contract; the crash flag is for disposable test runs, not normal operation.

Stop all app and worker processes before backing up the full `data` directory. SQLite's experimental warning on Node 22.16 is expected. See [architecture](ARCHITECTURE.md), [API contract](CONTRACT.md), and [agent reviews](journal/reviews).

This local edition does not provide untrusted-code sandboxing, real integrations, distributed deployment, organization accounts, scheduled triggers, a graph editor, or production observability. Existing GitHub repositories and sibling rebuilds remain unchanged.
