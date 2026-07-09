# Sprint 03 — Connector SDK v1 + First Two Connectors

**Branch:** `sprint-03/connector-sdk` · **Size:** L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** The abstraction sprint: a declarative connector SDK — auth requirements, triggers, actions, zod input/output schemas, and the mandatory **idempotency declaration** — plus a registry, and MailPost + SheetLite connectors proving the SDK absorbs vendor inconsistency.

## A — Issues
1. `packages/connector-sdk: defineConnector() — auth, triggers, actions, schemas, idempotency`
2. `Registry: connectors discoverable by API/UI with schema introspection`
3. `Connectors: MailPost (send-email action, new-email trigger), SheetLite (add-row, row-created)`
4. `HTTP client helper: vendor-aware (auth injection, pagination adapters, error normalization)`

## B — Commits
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(sdk): defineConnector — typed definition object, zod schemas per trigger/action` | schemas serve triple duty: validation, UI form generation (S4), docs |
| 2 | `feat(sdk): action contract — execute(ctx, input) with ctx.{connection, http, logger}; mandatory idempotency declaration` | `idempotency: {strategy: 'vendorKey'|'naturalKey'|'dedupeWindow', …}` — an action without one fails the registry's build-time check |
| 3 | `feat(sdk): http helper — auth injection, normalized errors (RateLimited, AuthFailed, VendorDown, BadInput)` | vendors' inconsistent errors normalize into a closed set the engine can reason about — the closed error taxonomy is the sprint's key design |
| 4 | `feat(sdk): pagination adapters — cursor, offset, link-header — one iterator interface` | SheetLite offsets, MailPost cursors; the iterator hides both |
| 5 | `feat(connectors): mailpost — send-email action, new-email trigger def` | send-email declares `vendorKey` (MailPost accepts Idempotency-Key header) |
| 6 | `feat(connectors): sheetlite — add-row action, row-created trigger def` | add-row declares `naturalKey` (row content hash + sheet id) — vendor has no idempotency support; the contrast is the lesson |
| 7 | `feat(api): registry — load connectors, expose schemas/metadata for UI consumption` | |
| 8 | `test(sdk): contract tests — every registered action validated against SDK invariants (schema roundtrip, error taxonomy compliance, idempotency present)` | the seed of S14's certification harness, named as such |
| 9 | `test(connectors): both connectors under failure injection — 429 → RateLimited, malformed → VendorDown, revoked → AuthFailed` | chaos-always-on begins |
| 10 | `docs: ADR-0005 declarative connectors + closed error taxonomy; connector authoring guide v1; curriculum note` | the authoring guide is written for a stranger — S14's learner is that stranger |

## C — Review order
The action contract (2) → error taxonomy (3) → the two idempotency declarations side by side (5 vs 6) → contract tests (8).

## D — Teaching comments (~10)
- declarative defs — 📘 data-not-code plugin surface: definitions can be introspected (UI forms), validated (registry), versioned (S14); code-as-plugin can only be executed
- closed error taxonomy — 📘 the engine will make retry decisions (S7) *per error class*; unbounded vendor errors → normalized classes is what makes engine-level retry policy possible at all
- idempotency declarations — 🔍 review-lens: this field is load-bearing for the whole course; `vendorKey` vs `naturalKey` on facing pages — read both `execute` bodies and note who carries the burden
- pagination iterator — 📘 absorbing inconsistency is the SDK's job; every adapter is ~20 lines, and connector authors never think about it again
- ctx.http not fetch — ⚠️ connectors must not reach the network except through the helper — auth, limits (S11), and normalization all hang off that chokepoint; lint rule enforces it
- contract tests — 📘 an SDK without conformance tests is a suggestion; these tests are the SDK's real spec

## E — Debate
**"Connectors as in-repo packages vs runtime-loaded plugins?"** Runtime: true ecosystem, but code-loading, versioning, and sandboxing problems arrive a decade early. In-repo: registry pattern with monorepo ergonomics. **Resolution:** in-repo packages behind the registry interface — the interface *is* plugin-shaped, so extraction later is mechanical; S9's sandbox is scoped to code *steps*, not connectors. Lesson: *design the seam now, pay the isolation cost when a third party actually shows up.*

## F/G — Close
- Squash: `feat(sprint-03): connector sdk, registry, first connectors (closes #…)`
- Deferred: ChatBox connector (S6 needs it — filed), dynamic dropdown options (S4).
- Recap idea: *a good SDK is measured by the second connector's diff size — SheetLite was 140 lines.*
