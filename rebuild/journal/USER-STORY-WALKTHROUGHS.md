# Relay: From "Automate This" to Durable Execution

The people, conversations and delivery sequences below are fictional teaching scenarios. Stories 1-6 explain implemented behavior. Stories 7-8 are proposed extensions, not features already built. Scripted Builder / Challenger / Verifier exchanges illustrate public design rationale; they are not quotes from Astra or Sol and do not reconstruct private model reasoning.

Actual executed checks remain in [VERIFICATION.md](VERIFICATION.md). A suggested acceptance test in a story is a design proposal unless it is explicitly tied to that report. The current app has one local workspace and simulated notification receipts; fictional teams below do not imply implemented organization accounts.

## Story 1: Tess wants a repeatable welcome message

Status: implemented transform/wait/notify workflow behavior.

Tess coordinates onboarding. Her request is, "Take a person's name, create a welcome message, pause briefly, then deliver it. Let me see what happened." In this local edition, delivery means a receipt in the simulated provider, not an actual email or chat message.

Before drawing an editor, we would turn the request into a small language:

- transform: add a prefix and suffix to the current text;
- wait: pause for a bounded number of milliseconds;
- notify: add an optional prefix and submit a simulated notification.

For input {text:"Sam"}, the example definition is:

```
1. transform, name="Compose welcome", prefix="Welcome, ", suffix="!"
2. wait, name="Short pause", ms=500
3. notify, name="Deliver welcome", prefix="Team update: "
```

The final message becomes "Team update: Welcome, Sam!". Each step consumes the previous output. That simple data contract is more useful than allowing arbitrary JavaScript before execution and recovery semantics are defined.

Acceptance criteria would state that a draft can be edited without running; publication captures a definition; a run uses that published definition; and the operator can inspect durable outputs and a provider receipt after success. If the worker restarts, completed step outputs must still exist.

The first delivery slice would implement validation and persistence for one transform step. A second slice would run it through the worker and checkpoint its output. Notify would follow only after deciding what a receipt means and where it persists. The editor comes after those observable contracts exist.

Source path: [src/app.js](../src/app.js) validates draft shape and exposes workflow routes; [src/store.js](../src/store.js) stores workflows, immutable versions, runs and checkpoints; [src/worker.js](../src/worker.js) executes the definition; [public/app.js](../public/app.js) presents the editor and run timeline. The mock provider's receipts live in a separate database.

Builder: "A for-loop can run these three steps in the HTTP request."

Challenger: "What happens when the page closes, the request times out, or the server restarts after step two? Which progress survives?"

Verifier: "I will execute through the worker and inspect stored checkpoints, not accept a completed badge as proof of durable work."

The result separates accepting a run from doing the work. POST creates a queued record. A worker claims it. The web app can keep serving pages while that work waits. This is a separation of responsibilities, not a claim that the local SQLite design scales without limits.

## Story 2: Tess edits the workflow while Sam's run is waiting

Status: implemented immutable publication and pinned run versions.

Sam's run has completed its first step and is waiting. Tess changes the notification prefix for future joiners and publishes again. She says, "Use the new wording next time, but don't change a job halfway through."

If the worker reads the mutable draft at every step, Sam's execution becomes a mixture of two programs. Recovery makes this worse: the worker could resume at index two even though editing moved or removed that step.

We would introduce two distinct records. A workflow contains an editable draft and a draft revision for concurrency. A published version contains an immutable step list with a publication number. A run stores the publication number it selected when it was created.

The publish route checks the caller's expected draft revision inside a transaction, validates the step list, inserts the next version, and updates the workflow's published pointer. SQL triggers reject updates and deletes of published definitions. The worker loads the version pinned on its run, not the current workflow draft.

Two counters deserve careful names. The mutable draft revision detects stale saves and publication requests. The published version number identifies a stable program. They need not advance together: several draft edits can occur before one publication. Confusing them leads to misleading UI labels and tests.

Acceptance criteria would include run A pinned to version 1, publication of version 2 during A's wait, and a new run B pinned to version 2. A retry of A's original creation request should still return A, even after publication.

That last condition shapes idempotency. This app binds a run-request key to workflow identity and input. On replay it returns the stored run before selecting a new publication. Otherwise retrying after a lost response could silently execute a different program. A genuinely new run uses a new key.

Builder: "The run can store workflowId and look up the latest steps."

Challenger: "Latest at which moment? Show the definition after a restart."

Verifier: "I will publish another version, replay the old request, and inspect both run identity and pinned version. I will also challenge direct mutation of the published record."

## Story 3: The message was accepted, then the worker died

Status: implemented and exercised with a real process exit.

The simulated provider records Tess's message. Immediately afterward the worker dies before writing its notification checkpoint. Tess sees an unfinished run and asks, "Will retrying send another welcome?"

There are two durable stores now. The app database records work progress. The provider database records accepted effects. No transaction spans them. That separation is intentional: putting both writes into one app transaction would avoid the very problem a real integration introduces.

Walk the timeline carefully:

```
A. Transform checkpoint commits in the app database.
B. Notify submits stable key runId:stepIndex.
C. Provider commits one receipt under that key.
D. Worker exits before the notify checkpoint commits.
E. Another worker later reclaims the expired run lease.
F. It resumes after the transform and submits the same notification key.
G. The provider returns the existing matching receipt.
H. The worker checkpoints notify and finishes the run.
```

The provider compares the message as well as the key. Same key with changed message is an error, not permission to return an unrelated prior result. The run pins its definition and preserves prior output, helping reconstruction of the same message during recovery.

We would implement this in small increments: durable provider acceptance; stable per-step keys; checkpoint-after-acceptance; a precise crash hook; then restart recovery. A normal process restart after every write commits is not enough to demonstrate this story.

Builder: "The worker will retry, so delivery is reliable."

Challenger: "Retrying can duplicate an accepted effect. Which independent participant recognizes the original request after the worker's memory dies?"

Verifier: "I will kill at C/D, inspect one receipt and the missing checkpoint, then restart and require one receipt, the original prior checkpoint, and a successful run."

The delivered durability test uses process exit code 86 at that boundary. Recovery completes on attempt 2 with one provider receipt. This establishes the cooperating local adapter's behavior. It does not prove that arbitrary email, payment or webhook services support the same guarantee.

If a real provider lacks request deduplication and outcome lookup, a timeout can remain ambiguous. The architecture must then choose a weaker delivery promise or an operator reconciliation path. Additional retries cannot create information that neither side retained.

## Story 4: A slow worker returns after its replacement starts

Status: implemented lease ownership and stale-checkpoint rejection.

Worker A claims a run and then stalls. Its lease expires. Worker B reclaims the run. A later wakes up with a result and wants to save it. Tess's request is, "Don't let the old worker overwrite the new worker's progress."

A lease is temporary ownership, not proof that the old process has stopped. The app gives each claim a fresh random token and an expiration. Checkpoint, renewal, completion and failure writes verify current token, running status and unexpired lease. An old token no longer authorizes a write.

For this database, equality with the current stored token supplies the fence. It is not a monotonically increasing sequence sent to an external provider. Do not claim it can make a remote service reject stale work unless that service participates in an appropriate fencing or idempotency protocol.

The implementation starts with a transactional claim: select an eligible run, update owner/token/deadline and increment attempt, then return the claim. Work occurs outside that write transaction. Heartbeats renew ownership. Every checkpoint opens a short transaction and verifies ownership again.

The source samples default transaction time after acquiring the write lock. Why? A timestamp captured before a long lock wait could say a lease was valid even though it expired before the write was admitted. The location of a clock read can therefore affect correctness, not just test convenience.

Builder: "We renew the lease regularly, so A should still own it."

Challenger: "Should is not authorization. What if renewal was delayed or failed? What predicate rejects A's late completion after B owns the run?"

Verifier: "I will save A's token, advance ownership to B, submit a checkpoint with A, and assert rejection and unchanged data."

That deterministic stale-token test complements crash recovery. Killing A alone makes it unable to write and cannot prove protection from a still-alive stale writer. Different failure stories need different evidence.

## Story 5: The provider is temporarily unavailable

Status: implemented simulated transient failure, bounded retry and manual retry.

An operator asks, "If delivery fails briefly, try again. If it keeps failing, show me the problem and let me retry after I fix it."

We would first classify failures. A temporary provider outage might be retryable. Invalid step configuration or an oversized output generally needs correction rather than the same automatic request repeated indefinitely. The local worker marks its simulated provider failure as transient.

Persist the failure, retry count and next eligible time. The current policy uses exponential delays based on a configured base, with bounded exponent and retry budget. A process restart does not reset the schedule merely because an in-memory timeout disappeared.

Distinguish claim attempts from retry-budget failures. The attempt counter records claims, including crash recovery. The failure counter controls the automatic retry budget. Manual retry of a failed run resets that budget while keeping attempt history and completed checkpoints. Those counters answer different operational questions.

During recovery the worker reconstructs output from the last saved checkpoint and continues at the next step. Re-running a completed transform unnecessarily would become dangerous once a richer step catalog existed. Completed work should not be repeated just because a later step failed.

Builder: "I will put setTimeout(retry, 500) in the worker."

Challenger: "Which run retries after a restart, and what stops endless work?"

Verifier: "I will exhaust automatic retries, inspect the persisted failure, remove the simulated fault, manually retry, and verify existing checkpoints remain while the run succeeds."

Future production behavior could add jitter, provider-specific limits, retry classification and a maximum run age. Those are proposals, not current features. Repeated crashes before recording failure are also not the same as recorded transient failures; the existing retry budget should not be described as a universal cap on every possible reclaim.

## Story 6: Tess cancels a run and then edits a draft

Status: implemented cancellation and draft recovery, with explicit limits.

Tess accidentally starts a workflow with a long wait and clicks Cancel. The run should stop before the next eligible notification. Cancellation changes stored run state and invalidates the lease, so a worker checking ownership cannot continue checkpointing as if the run were still active.

Now move the cancel click slightly later: the provider already accepted the message. Cancellation cannot unsend that effect. This is why the interface describes the limit instead of presenting Cancel as a universal rollback.

A useful acceptance matrix separates cancel while queued, during a wait, before provider acceptance, and after acceptance. The current cancellation test covers waiting work and lease invalidation; the crash/provider tests explain why already accepted effects require separate treatment.

After cancelling, Tess edits another workflow. A second tab saves a newer draft before she does. The stale save returns a conflict. Her local fields must remain until she explicitly loads current data; polling must not quietly replace them. A correct 409 at the API is only half of this user story.

Two subtle input/session cases matter. An empty wait field must stay empty when steps are reordered; Number('') would convert it to a valid zero. And an expired session must allow reconnection while preserving the unsaved draft, without automatically repeating the failed mutation after login.

Builder: "The API handles cancel and stale saves."

Challenger: "Does polling overwrite a dirty form? Does login retry a write the user has not reviewed? Can a blank required field silently become zero?"

Verifier: "I will operate through the real editor, reorder a cleared wait, expire the stored session, and inspect the fields and network outcomes."

Those input and reconnection cases became actual browser regressions during the build. They show why architecture review needs to include the editor's state ownership as well as worker storage.

## Story 7: The team wants a daily schedule and real webhooks

Status: proposed extension only; no scheduler or real webhook step exists.

The request is, "Every weekday morning, run our published report workflow and send the output to our endpoint." This adds two boundaries: time-based run creation and untrusted network destinations.

For scheduling, first decide the time zone, daylight-saving policy, missed-run behavior and which published version a scheduled occurrence selects. A laptop that wakes three hours late could skip, catch up once, or generate every missed occurrence. None is universally correct; the product must choose.

A proposed occurrence record could identify schedule plus nominal execution time. A unique occurrence key would prevent two scheduler processes from creating duplicate runs. Persist the occurrence and run creation coherently. An in-memory cron callback alone does not settle restart or duplicate scheduler behavior. Keep the run version pinned once the occurrence becomes a run.

For webhooks, do not turn notify into fetch(userUrl) and declare completion. A production design needs destination policy, secret references, bounded payloads, timeouts, redirect handling and network isolation appropriate to its deployment. Redirects and name resolution can change where a request goes; validation cannot stop at the original text of a URL. This is a design topic, not a completed network security implementation.

The receiver's idempotency behavior matters too. If it accepts a stable key, document retention and changed-payload behavior. If it does not, display an honest delivery guarantee and an ambiguous-outcome recovery path. A 200 response can mean accepted, not necessarily fully processed; agree on the contract.

Build a local test receiver first. Make it accept then disconnect, delay, reject permanently, redirect, and return duplicate acknowledgments. That gives the verifier a controlled set of histories before credentials or real services enter the exercise.

## Story 8: A customer wants branches and large document outputs

Status: proposed extension only; current definitions are linear and bounded.

The request is, "If a document needs approval, wait for a person; otherwise send it automatically. Keep the document available when the worker restarts." This is a new execution model, not simply another dropdown option.

The current worker resumes from the count of sequential checkpoints. Branches would require durable node identities, explicit edges or control flow, node state, dependency satisfaction, and rules for joining multiple paths. A list index is no longer enough to describe every runnable unit of work.

Human approval also exceeds a short worker lease. A proposed design stores a waiting-for-approval state and an authenticated, versioned decision. It releases execution ownership while waiting, then queues continuation after the decision commits. Holding a worker process for days is unnecessary and does not itself persist the decision.

For large outputs, propose a durable object store rather than a memory map. The checkpoint stores a verified reference, size and integrity metadata only after the object is durable. A crash can leave an orphan object before the checkpoint commits; retention and cleanup must account for that. Deleting an object before every referencing run is safely retired creates the opposite problem: a durable pointer to missing content.

Builder: "I can upload the file and store its URL."

Challenger: "When is it durable, who can read it, what survives expiration, and which failure leaves an orphan or a missing referenced object?"

Verifier: "I will crash between each boundary, restart from stored references, and verify authorization, contents, and cleanup behavior."

The deliverable before coding is a worked graph with two branches and a join, an approval transition table, an object lifecycle, and explicit crash cases. The current runner remains a useful baseline because its smaller guarantees are visible and testable.
