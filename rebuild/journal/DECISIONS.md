# Decisions before implementation

These record explicit engineering rationale. Final evidence is separate; a design promise is not a test result.

| Decision | Alternative considered | Reason and revisit condition |
|---|---|---|
| Database-backed work queue and checkpoints | Queue as authority plus separate database state | One transactional store keeps claim state and checkpoints together for the local edition. Distributed deployment may justify a broker, but its delivery semantics still need reconciliation. |
| Immutable published versions pinned to runs | Execute the latest mutable draft | A restart must resume the same program, not whatever someone edited while the worker was down. |
| Fixed transform/wait/notify steps | Arbitrary JavaScript execution | The learning target is durable execution, not untrusted-code isolation. A VM convenience API would not automatically provide a safe sandbox. |
| Inline bounded outputs in SQLite | In-memory offloaded output blobs | Checkpoint metadata is useless if its referenced output vanishes on restart. Larger blobs would require a separately durable store and lifecycle policy. |
| Lease identity checked on every checkpoint | Lease checked only at initial claim | An expired worker can still be alive. It must be fenced out after reclaim, even if its old work finishes late. |
| Stable run/step idempotency key at a separate durable mock provider | Worker-local deduplication | A process can die after the effect commits but before checkpointing. Only a cooperating provider can safely recognize the retry. |
| Test process exit at the exact effect/checkpoint boundary | A generic restart happy path | The difficult uncertainty window must be exercised directly. Separately test old-token rejection; killing a worker alone does not prove fencing. |

No universal external exactly-once guarantee is claimed. The local mock provider persists receipts and cooperates with deduplication. A real provider without that capability requires weaker guarantees or an explicit reconciliation workflow. Cancellation cannot undo an effect already accepted outside the app transaction.
