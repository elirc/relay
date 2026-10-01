# Relay Practice Workbook

These exercises extend your understanding; they are not claims that additional features were implemented or extra experiments were already executed. Existing tests use disposable stores. Keep crash flags and fault fixtures away from the running demo's saved data. Use a separate copy or version-control branch for code changes. Suggested times are estimates, not deadlines.

For each exercise, predict first, inspect code second, then gather evidence. Write a short explanation of what the test proves and what it does not prove.

## Lab 1: Draw the three identities (30 minutes)

An operator submits key K for workflow 3 with input "Sam". Run 42 is created. Worker A claims it with token L1 and submits notification key "42:2". A crashes after acceptance. Worker B claims the same run with token L2.

For each identity, write whether it must stay the same or change during:

- Browser retry of the initial submission.
- Worker restart and reclaim.
- A genuinely new run of the same workflow/input.
- A second notification step in the same run.

**Answer guide:** K stays on request retry; L changes on a new claim; the provider key stays for retry of the same run/step but changes for another step or run. A new run needs a new request key even with identical input. Matching input does not automatically mean the operator intended the same execution.

Locate each identity's generation or validation in [src/app.js](../src/app.js), [src/store.js](../src/store.js) and [src/worker.js](../src/worker.js). Explain why a lease token is a poor provider idempotency key.

## Lab 2: Predict a publish-and-retry timeline (45 minutes)

Workflow W has publication 1. Request K creates run A but the response is lost. The operator edits and publishes version 2, then resends K with the same input. Another request J starts a fresh run with that same input.

Predict the identities and versions of the responses. Then find the run route's ordering of existing-key lookup versus selecting the published version.

**Answer guide:** K returns A pinned to publication 1. J creates a different run pinned to publication 2. Including "current latest publication" in the replay intent check would accidentally turn K into a conflict or a new execution. The stored run is the record of what the first accepted request selected.

Read the version-pinning test and identify its durable assertions. A heading that says "v1" is insufficient if the worker actually reads mutable v2 steps.

## Lab 3: Crash at the difficult boundary (60-90 minutes)

Read the first crash case in [tests/durability.test.js](../tests/durability.test.js). Identify the two database files, child process, crash flag, exit code and assertions before restarting. Draw the exact line between accepted provider effect and saved app checkpoint.

Run the existing disposable suite:

```
node --test tests/durability.test.js
```

Use the suite's temporary stores rather than setting CRASH_AFTER_EFFECT_ONCE on the running app. The command also runs the other durability scenarios in that file; read their names before interpreting the output.

**Answer guide:** before restart there is one prior transform checkpoint and one provider receipt, while notify is not checkpointed. After recovery there are two checkpoints, one receipt and a successful run on attempt 2. The prior checkpoint retains its identity. Merely observing eventual success would miss a duplicate notification.

Now remove provider deduplication only in a disposable experiment and predict the failure before executing it. The expected lesson is that checkpoint fencing alone cannot prevent a repeated external effect. Restore the implementation after recording the counterexample; do not weaken the one-receipt assertion.

## Lab 4: Expire a lease without killing the old writer (45-60 minutes)

Read claimRun, renewLease and checkpointStep. Identify which predicates include run state, current token and expiration. Design a deterministic sequence that keeps A's token, gives ownership to B, then calls checkpointStep with A's token.

**Answer guide:** the old checkpoint is rejected and stored progress does not change. Killing A and observing B recover does not test this condition, because a dead A cannot submit its late result. Explicit supplied time allows tests to represent the ordering without fragile real sleeps.

Explain why current time should be sampled after a write lock is acquired. Then explain why token equality in this app database does not authorize the database to erase an already accepted effect in the provider database.

## Lab 5: Explain retry counters to an operator (45 minutes)

Read failRun and the manual retry route. Create a fictional incident note: "This run was claimed five times but exhausted a retry budget of three. Is that necessarily a bug?"

**Answer guide:** not necessarily. Claims and recorded failures are different. Crash recovery can increment total attempts without recording a transient failure; manual retry resets the failure budget while retaining history. Inspect the events and policy before concluding the counter is inconsistent.

Design an additional maximum-run-age policy on paper. Define whether waiting time and operator-paused time count, what status is shown on exhaustion, and whether manual retry extends the deadline. This policy is not implemented.

For a real provider, list examples of transient, permanent and uncertain outcomes. A timeout after acceptance is uncertain even if a network library labels the transport error retryable. The business consequence matters more than the exception's class name.

## Lab 6: Protect the editor's unsaved work (45-60 minutes)

Read the browser scenarios for stale drafts, blank wait inputs and session reconnection. For each, name the backend guarantee and the UI guarantee.

**Answer guide:**

- Conflict: server refuses the old revision; UI retains the user's fields until an explicit reload/review action.
- Blank wait: server rejects invalid duration; UI must not convert the blank into zero while reordering and accidentally submit a different valid value.
- Session expiry: server rejects the old token; UI offers reconnection while retaining work and does not automatically repeat the failed mutation.

Sketch the sequence when an old polling request finishes after navigation to a different run. Explain how page/request identity prevents its result from owning the new view. Aborting the old request can be an optimization, but a response guard still makes the ownership rule explicit.

## Lab 7: Define what "wait ten seconds" should mean (60 minutes)

The current wait calculates an in-memory deadline when execution reaches it. If the worker crashes after eight seconds but before checkpointing, recovery starts that uncompleted wait again. Predict the total elapsed delay in a case with a short reclaim gap. It exceeds the original ten seconds.

Do not call that automatically wrong. It follows one policy: complete the configured wait within an attempt before checkpointing. Another product may require "continue no earlier than ten seconds after first entering this step." That second policy needs a persisted deadline.

Design the extension: where is first-entry time saved, how does another claim reuse it, what happens if the clock changes, and how does cancellation work? Propose a deterministic test that restarts after partial elapsed time and checks the remaining interval rather than sleeping through a long demo.

**Answer direction:** establish a durable step timing fact before waiting, keep completed checkpoint semantics distinct from timing metadata, and have the replacement use the recorded target. The source does not currently implement that extension; it is an opportunity to practice a precise new contract.

### Implementation tier (optional, 3-6 hours)

Build the persisted-deadline policy you designed, on a branch. Write the tests first, in the harness style of [tests/durability.test.js](../tests/durability.test.js) (real child processes, temporary stores, supplied clocks — no long real sleeps).

Done when:

- A new durability test starts a wait, crashes the worker after a partial elapse, restarts, and asserts the run continues **no earlier than** the originally recorded target and does not wait the full configured duration a second time.
- Cancellation during a persisted wait is covered: the recorded deadline does not resurrect a cancelled run.
- A run created before your change (no recorded deadline) still completes under the old restart-the-wait policy — the schema change has an explicit migration or compatibility rule, stated in [CONTRACT.md](../CONTRACT.md).
- The original three suites still pass unchanged: `npm run check`, `npm test`, `npm run test:browser`.
- One paragraph added to your learning journal naming what the new policy still cannot promise (for example, clock changes between processes).

## Lab 8: Run one journey against the real supervisor (45 minutes)

[VERIFICATION.md](VERIFICATION.md) discloses that browser automation drives an in-process worker, while the durability and lifecycle suites exercise real child processes. This lab makes you confront what each setup can and cannot show.

Start the real thing from the project folder — `npm start` launches the web process **and** a separate worker through [scripts/start.js](../scripts/start.js) — and walk one journey by hand: publish a workflow with a wait step, run it, watch the run move through the worker, then stop everything with Ctrl+C mid-run and start again. Predict before each step: who owns the run right now, what is checkpointed, and what the UI can honestly display while the worker holds the lease.

**Answer guide:** the in-process browser harness proves UI-to-API behavior but cannot prove process ownership, lease recovery, or IPC shutdown — those live in [tests/durability.test.js](../tests/durability.test.js) and [tests/lifecycle.test.js](../tests/lifecycle.test.js). The restarted supervisor should resume your interrupted run from its checkpoints after the lease expires; the UI shows the same run, not a duplicate. If you expected the browser suite alone to cover this, write down which promise you were silently assuming it tested. Selecting evidence to match the promise is the skill; rerunning every suite everywhere is not the goal.

## Capstone: Add a realistic local webhook adapter (3-5 hours)

Proposed extension; no real webhook step exists today.

Start with a local test receiver and a proposed webhook step. The receiver can persist a request key and payload fingerprint, return an existing receipt, accept then disconnect, or delay until the caller times out. Do not begin with unrestricted internet URLs or live credentials.

Deliverables:

- Payload, response and idempotency contracts for the receiver.
- Timeout and cancellation policy, including accepted-but-unknown outcomes.
- Versioned workflow schema and a migration story for existing definitions.
- A bounded output/receipt model and redacted error reporting.
- A failure matrix covering before acceptance, after acceptance, before checkpoint, changed payload under the same key and stale ownership.
- An explicit design for destination restrictions and secret references before considering deployment beyond the isolated local receiver.

**Answer direction:** store and retry stable run/step intent across worker attempts. Do not use an attempt token as the effect key. The receiver's durable behavior is part of the guarantee. If you deliberately remove its deduplication support, change the delivery promise and recovery UI instead of claiming the original one-receipt guarantee still holds.

### Implementation tier (optional, add 4-8 hours)

The deliverables above are the design half. If you build it, acceptance is test-shaped. Done when:

- The local receiver is its own process with its own durable store, started and stopped by your tests the way [tests/durability.test.js](../tests/durability.test.js) manages workers.
- A crash test exits the worker between receiver acceptance and the webhook step's checkpoint; the restarted worker retries the same intent key and the receiver's store holds **exactly one** delivery record afterward.
- A changed-payload-same-key request is rejected by the receiver and surfaces as a visible run failure, not a silent overwrite.
- The accept-then-disconnect and delay-past-timeout receiver modes each map to a defined run outcome (uncertain is an allowed outcome — but it must be displayed as uncertain, with the operator recovery path you designed).
- Workflow definitions without a webhook step still validate, publish, and run — your schema change has a stated version/migration rule.
- The original three suites still pass unchanged, and your new tests live in their own file so the original evidence record stays legible.

## Adversarial review session template

Builder brief: "State the feature's user outcome, persisted records, immutable identities and failure boundaries. Implement one vertical slice. List what is deliberately outside the scope."

Challenger brief: "Construct a concrete crash, stale-owner or duplicate-request history that falsifies the guarantee. Separate app-database protection from provider cooperation. Ask for an observable policy where the outcome is ambiguous, not just another retry."

Verifier brief: "Use independent assertions and disposable stores. Inspect both effect and checkpoint state. Explain why the chosen failure injection hits the claimed window. Report uncertainty and timing flakiness explicitly."

Keep a resolution note with: initial promise; counterexample; alternatives; chosen boundary; persisted facts; falsifying test; observed outcome; remaining limits. A reviewer who agrees without a counterexample has not necessarily challenged the design. A reviewer who asks for endless complexity has not necessarily improved it either.

Score your explanation 0-2 on each dimension: version/identity clarity, ownership correctness, effect-recovery semantics, appropriate independent evidence, and honest scope. Ten points means you can explain the guarantee and how it might fail. It does not mean the system has no remaining bugs.
