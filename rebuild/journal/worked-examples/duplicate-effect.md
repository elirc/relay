# Worked example: the duplicate effect that checkpoint fencing cannot stop

This performs the disposable experiment prescribed at the end of Lab 3 in
[PRACTICE-WORKBOOK.md](../PRACTICE-WORKBOOK.md) — "remove provider deduplication
only in a disposable experiment and predict the failure before executing it" —
exactly once, as a model of the loop: predict, break, observe, revert. If you
are doing the lab, run your own experiment before reading past "Predict first";
the point is your prediction, not this transcript.

Everything here uses the durability suite's temporary stores (`mkdtemp` under
the OS temp directory, deleted afterwards). Never set crash flags or apply this
edit against the running demo's `data/` directory.

Baseline on a clean tree:

```
node --test tests/durability.test.js
# tests 5 / pass 5 / fail 0 — duration_ms 11013.6161 (about 11–13s per run)
```

## Predict first

The first crash test arranges: the worker completes the transform (checkpoint 1
saved), the provider durably accepts notification key `<runId>:1`, then the
worker exits with code 86 **before** checkpointing the notify step. Recovery
reclaims the expired lease and retries the notify step with the same
`runId:stepIndex` key.

With provider dedup removed, predict the two stores after recovery:

- App database: unchanged behavior — two checkpoints, first keeps its ID, run
  `succeeded` on attempt 2. Fencing still works; nothing here looks wrong.
- Provider database: **two** receipt rows for the same key `<runId>:1`, same
  message — the retry inserts instead of replaying the existing receipt.

Which assertion catches it? The post-recovery receipt count in
`tests/durability.test.js` (the filter on `receipt.key === `${created.id}:1``
asserting length 1, line 271). Spoiler below the break.

## The break

Dedup lives in two places in [src/store.js](../../src/store.js): the UNIQUE
constraint on the receipts table and the existing-receipt branch in
`acceptNotification`. The minimal disabling edit (recorded exactly):

```diff
   providerDb.exec(`CREATE TABLE IF NOT EXISTS receipts (
-    id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, message TEXT NOT NULL, created_at TEXT NOT NULL
+    id INTEGER PRIMARY KEY, key TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
   );`);
@@ export function acceptNotification(...)
-    if (existing) {
+    if (false && existing) {
```

(Leaving UNIQUE in place would turn the retry into a constraint error instead
of a silent duplicate — a different, louder failure. The silent one is the
lesson.)

## What actually happened

`node --test tests/durability.test.js`, run twice with the break in. Both runs
identical: 4 pass, 1 fail, and only the crash test fails — the failpoint
(`CRASH_AFTER_EFFECT_ONCE=1`, exit code 86) makes it deterministic. Trimmed
real output:

```
not ok 1 - worker crash after durable provider effect resumes one receipt and prior checkpoint
  error: |-
    Expected values to be strictly equal:

    2 !== 1
  expected: 1
  actual: 2
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (file:///C:/Users/Owner/Desktop/astrafinalorganize/relay-rebuild/tests/durability.test.js:271:14)
...
# tests 5
# pass 4
# fail 1
```

Two receipts for key `<runId>:1` where one is promised. Note where line 271
sits: **after** `eventually(... status === "succeeded")` resolved. The run
completed green on attempt 2, both checkpoints saved, the first kept its ID —
from the app's perspective the recovery succeeded. The duplicate lives in the
other store. Merely observing eventual success would have missed it, which is
exactly what the Lab 3 answer guide warns about.

## Why checkpoint fencing could not save us

Lease tokens and checkpoint ordering protect the **app** database: a stale
worker's late writes are rejected, finished steps are not re-executed or
overwritten. But the notification was accepted in the provider's database,
outside the app transaction, in the crash window before the checkpoint. On
restart the app database honestly says "notify not done," so retrying is
correct — the app store alone cannot distinguish "accepted but uncheckpointed"
from "never accepted" (READ-ME-FIRST.txt, section 1). Only the cooperating
provider, keyed by stable `runId:stepIndex`, can recognize the retry and
return the existing receipt. That is the DECISIONS.md row: a stable idempotency
key at a *separate durable mock provider* was chosen over worker-local
deduplication, because worker-local state dies with the worker.

## Restore and confirm

```
git checkout -- src/store.js
node --test tests/durability.test.js   # tests 5 / pass 5 / fail 0
git status --short src/                # empty
```

## Doing this yourself

1. Clean tree. Baseline: `node --test tests/durability.test.js` (all 5 pass).
2. Write your prediction down first — both stores, and the exact assertion.
3. Apply the two-line break above to `src/store.js` only.
4. Run the durability suite twice; it uses disposable temp stores, so nothing
   touches the demo data. Expect the same single failure both times.
5. `git checkout -- src/store.js`, rerun, confirm green and `git status` clean.

Never leave the break in, never commit it, and do not "fix" the red test by
weakening the one-receipt assertion — the assertion is the counterexample
detector, and the suite's job is to keep this window observable.
