# Sprint 14 — Connector Farm at Scale + Learner Certification

**Branch:** `sprint-14/connector-cert` · **Size:** L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** Turn the connector SDK into a scalable ecosystem: connector versioning, a rigorous certification test harness, dynamic dropdowns and dynamic schemas, and — the course's practical exam — **the learner authors and certifies a brand-new connector solo**, with the AI acting only as reviewer.

## A — Issues
1. `Connector versioning: semver per connector, relays pin versions, deprecation flow`
2. `Certification harness: automated conformance any connector must pass to ship`
3. `Dynamic fields: vendor-populated dropdowns (list my sheets), dynamic input schemas`
4. `LEARNER TASK: author + certify a new connector against the harness (AI reviews)`

## B — Commits
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(sdk): connector semver + version pinning in relay definitions + deprecation metadata` | breaking a connector's schema is a major bump; relays keep working on pinned versions (🔗 S4 version immutability, ecosystem-scaled) |
| 2 | `feat(sdk): dynamic dropdowns — action inputs can call the connector to populate options (cached)` | "pick a sheet" calls SheetLite live; caching + the S11 governor apply |
| 3 | `feat(sdk): dynamic input schemas — schema depends on a prior field (pick sheet → its columns become fields)` | the hard SDK feature; schema-as-function-of-connection-state |
| 4 | `feat(test): certification harness — schema roundtrip, error-taxonomy compliance, idempotency declared+honored, chaos survival, auth/refresh, dedupe key present` | the S3 contract tests, grown into a gate; a connector passes or it doesn't ship; the harness *is* the spec |
| 5 | `refactor(connectors): existing 3 connectors run through certification; fix any gaps found` | dogfooding the gate on our own connectors first — some fail, honestly (body lists what) |
| 6 | `docs: connector authoring guide v2 + certification checklist (the learner's manual)` | written for the stranger who is about to be the learner |
| 7 | `feat(connectors): [LEARNER-AUTHORED] a new connector — e.g. a mock CalendarLite, or a real free API` | **the exam:** learner writes it following the guide; commits are theirs; the AI's review comments are the teaching artifact |
| 8 | `test: [LEARNER] connector passes certification; AI review pass documents what a senior caught` | the AI's review of the learner's connector is written as the sprint's centerpiece teaching comment set |
| 9 | `docs: ADR-0015 connector versioning + certification; curriculum note (learner's authoring retro)` | |

## C — Review order
Certification harness (4) — *this is the rubric the learner will be graded against; read it first* → dynamic schemas (3) → **the learner's connector (7) with the AI review (8)**.

## D — Teaching comments (~10)
- certification-as-spec — 📘 an ecosystem needs a gate, not goodwill; the harness encodes every lesson (idempotency, error taxonomy, chaos survival, auth) as an automated check — passing it *is* the definition of "a real connector"
- semver on connectors — 📘 third parties depend on your schemas; changing them is an API break; pinning + deprecation windows are how ecosystems don't shatter
- dynamic schema — ⚠️ schema-as-function introduces a new trust/loading problem: the form can't render until a prior field resolves; loading states and failure modes for *form construction itself*
- dogfooding the gate — 🔍 review-lens: running our own 3 connectors through the new harness *found gaps* — build the test that judges your existing work, and be honest when it fails you
- **the learner's connector** — 📘 the AI's review comments on commit 7 are the payoff of the entire course: idempotency strategy choice, error mapping, chaos handling, dedupe key — every prior sprint's lesson, now applied by the learner and checked by a senior; this is the graduation moment
- authoring guide for a stranger — 📘 documentation is certified too: if the learner (the stranger) can ship a passing connector from the guide alone, the guide works

## E — Debate
**"Certification: strict gate (must pass all) vs tiered (verified/community)?"** Strict: quality guarantee, higher authoring bar. Tiered: ecosystem growth, variable quality. **Resolution:** strict for first-party + a clearly-labeled "community/unverified" tier that still must pass *safety* checks (idempotency, no-escape) but not polish checks — safety is non-negotiable, quality is signaled. Lesson: *ecosystems scale on tiers, but the safety floor never lowers.*

## F/G — Close
- Squash: `feat(sprint-14): connector versioning, certification, +1 learner connector (closes #…)`
- Deferred: connector marketplace UI, connector telemetry, OAuth scope-minimization linter.
- Recap idea: *you've now built the thing and shipped a piece of it under the same bar as the author — that's the transition this whole curriculum exists to produce.*
