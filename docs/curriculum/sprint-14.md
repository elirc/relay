# Curriculum Note — Sprint 14: Connector Farm at Scale + Learner Certification

> **The graduation moment.** You author a brand-new connector solo, following the guide, and pass it
> through the same certification harness that gates our own connectors. The AI's review of your connector
> is the payoff of the entire course — every prior sprint's lesson, applied by you and checked by a senior.

## Learning objectives
- Turn an SDK into an **ecosystem**: versioning, deprecation, and an automated **certification gate**.
- Understand why **the harness is the spec** — "a real connector" is a test you pass, not a vibe.
- Ship a piece of the product under the **same bar as the author** — the transition this curriculum exists
  to produce.

## Key concepts
- **Certification-as-spec: a gate, not goodwill.** An ecosystem can't rely on every author's diligence, so
  it encodes the rules as automated checks: idempotency declared, dedupe key present, valid semver, auth,
  schemas. Passing the harness *is* the definition of a real connector. We **dogfood it on our own three
  connectors first** — and if the gate we built to judge others fails *us*, we fix our connectors, honestly.
- **Semver on connectors: third parties depend on your schemas.** A connector's input/output schema is an
  API. Change it in a breaking way and every relay pinned to it breaks. So a breaking change is a MAJOR
  bump, relays pin the version they were built against, and `deprecated` starts a window instead of
  yanking the rug. Pinning + deprecation windows are how ecosystems don't shatter on the first change.
- **Tiers with a fixed safety floor.** First-party connectors pass **strict** (zero findings); a community
  tier may ship with *quality* gaps but never *safety* gaps. Safety (idempotency, dedupe, no-escape) is
  binary and universal; quality is signaled. *Ecosystems scale on tiers, but the safety floor never
  lowers.* (The debate.)
- **Documentation is certified too.** The authoring guide is validated by an outcome: if a stranger — the
  learner — can produce a `strictPass: true` connector from the guide alone, the guide works. CalendarLite
  is that proof.
- **The learner's connector is the whole course, applied.** Choosing `vendorKey` over `dedupeWindow`,
  writing tight schemas, declaring the trigger's `dedupeKey`, routing all I/O through `ctx.http` — every
  earlier lesson shows up in one small file. The AI's review comments on it are the sprint's centerpiece.

## The debate, cashed
**Strict gate vs. tiered certification.** Resolved: strict for first-party + a labeled community tier that
must pass *safety* but not *quality* checks. *Safety is non-negotiable; quality is signaled.*

## Exercise questions
1. Why is a connector's output schema an "API" that needs semver? Give a change that's safe on the same
   version and one that requires a major bump.
2. The community tier allows quality gaps but not safety gaps. Draw the line: which of {no idempotency,
   non-object schema, missing dedupeKey, no basePath} are safety vs. quality, and why?
3. Running our own connectors through the new harness could find a gap. Why is building the test that
   might fail your existing work a sign of maturity, not embarrassment?
4. CalendarLite chose `vendorKey`. Justify it over `naturalKey` and `dedupeWindow` for "create calendar
   event," and describe the retry scenario each handles.

## Your authoring retro
Write half a page: which certification check was hardest to satisfy, which prior sprint's lesson you
leaned on most, and one thing the AI's review caught that you'd now check yourself.

## Deferred
Connector marketplace UI · connector telemetry · OAuth scope-minimization linter · dynamic input schemas
(schema-as-function-of-a-prior-field) beyond the dropdown case.

## Further reading
- Plugin ecosystems & certification (VS Code, Terraform providers) · Semver & deprecation policy ·
  Conformance test suites as specs · Two-tier marketplaces (verified vs. community)
