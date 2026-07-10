# ADR-0005: Declarative connectors + a closed error taxonomy

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S03
- **Deciders:** Relay authors

## Context
Relay's value is the breadth of its integrations, so the cost of the *Nth* connector must be tiny. The
vendor farm (S02) proved vendors are gratuitously inconsistent (auth headers, pagination, error shapes).
We need a connector model that (a) makes authoring cheap and uniform, (b) lets the engine reason about
failures without knowing any vendor's specifics, and (c) forces the one thing that makes retries safe.

## Decision
Connectors are **declarative definitions** (`defineConnector` / `defineAction`), not free code:
- Each action carries **zod input/output schemas** that serve triple duty — runtime validation, UI form
  generation (S04), and docs.
- Each action MUST declare an **idempotency strategy** (`vendorKey` | `naturalKey` | `dedupeWindow`).
  An action without one fails registry registration at boot. This field is load-bearing: S07's engine
  retries, and a retried side effect that isn't idempotent is a bug the user feels.
- Connectors reach the network only through **`ctx.http`**, a chokepoint that injects auth and
  **normalizes every failure into a closed taxonomy**: `RateLimited | AuthFailed | VendorDown |
  BadInput | Unknown`. The engine makes retry decisions per class; it never sees a raw vendor error.
- A **registry** loads connectors and exposes their metadata as data.

## Alternatives considered
- **Connectors as free imperative code (a function per integration).** Maximally flexible, but you can't
  introspect it (no auto-generated forms), can't validate it (no build-time invariants), can't version
  its interface cleanly. Code-as-plugin can only be *executed*; data-as-plugin can be *described*.
- **Open/pass-through error handling (surface the vendor's error).** Lets callers do anything — and
  forces the engine to understand every vendor's error dialect, which is unbounded. Retry policy becomes
  impossible to state. A closed taxonomy is the price of engine-level retry logic.
- **Optional idempotency.** Every "we'll add it later" is a duplicate-charge incident waiting for S07.
  Making it mandatory (enforced at registration) is cheap insurance.

## Consequences
- The second connector is small: SheetLite was ~140 lines. That diff size *is* the SDK's quality metric.
- The engine (S07) can implement one retry policy keyed on five error classes, forever, regardless of how
  many vendors exist.
- Contract tests become the SDK's real spec and the seed of S14's certification harness.
- **Plugin seam (the S03 debate):** connectors are in-repo packages *behind the registry interface*. The
  interface is already plugin-shaped, so extracting to runtime-loaded third-party plugins later is
  mechanical — we pay the isolation/versioning/sandboxing cost when a third party actually shows up, not
  a decade early. (S09's sandbox is for user *code steps*, a different, smaller surface.)

## Links
- `packages/connector-sdk/`, `packages/connectors/`, `docs/connector-authoring-guide.md`,
  `apps/api/src/routes/connectors.ts`, ADR-0003 (vendor farm), `docs/sprints/sprint-03.md`
