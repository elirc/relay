# ADR-0015: Connector versioning + certification (tiers with a fixed safety floor)

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S14
- **Deciders:** Relay authors

## Context
The connector SDK becomes an ecosystem: third parties (and, in this course, the learner) author
connectors we didn't write. Two problems arrive with scale. (1) A connector's schema is an API that
relays depend on — changing it breaks their mappings. (2) We can't manually vet every connector, but we
also can't ship unsafe ones (a connector with no idempotency double-sends; one with a network escape is a
liability).

## Decision
- **Semver per connector + version pinning.** Each connector declares a `version`; relays pin the version
  they were built against and keep working when a new major ships (S04 immutability, ecosystem-scaled).
  A breaking schema change is a MAJOR bump; `deprecated` starts a deprecation window without breaking
  pinned relays.
- **Certification is an automated gate, not goodwill.** The harness (`certifyConnector`) encodes every
  lesson of the course as a check — idempotency declared, dedupe key present, valid semver, auth declared,
  object schemas. A connector passes or it doesn't ship. **The harness IS the definition of "a real
  connector."** We dogfood it on our own connectors first (and fix what it finds).
- **Two tiers, one non-negotiable floor (the debate).** First-party connectors must pass **strict** (zero
  findings). A **community/unverified** tier may ship with *quality* gaps (missing polish) but NEVER with
  *safety* gaps (idempotency, dedupe key, escape-safety). Safety is binary and universal; quality is
  signaled, not required. *Ecosystems scale on tiers, but the safety floor never lowers.*

## Alternatives considered
- **Strict gate for everyone.** Highest quality, but a high authoring bar that stunts ecosystem growth —
  most community authors won't polish to first-party standards, and we'd rather have a clearly-labeled
  "unverified but safe" connector than no connector.
- **No gate (goodwill / manual review).** Doesn't scale, and "we'll review it" becomes "we shipped an
  unsafe connector we didn't have time to review." Automate the floor.
- **No versioning (connectors always latest).** Every schema change silently breaks pinned relays — the
  ecosystem shatters on the first breaking change. Pinning + deprecation windows are how it survives.

## Consequences
- A stranger (the learner) can ship a passing connector from the authoring guide alone — the guide is
  itself certified by that outcome.
- Our own connectors are held to the same automated bar we hold third parties to — no double standard.
- **Deferred:** a marketplace UI, connector telemetry, an OAuth scope-minimization linter.

## Links
- `packages/connector-sdk/src/certify.ts`, `packages/connectors/src/certify.test.ts`,
  `packages/connectors/src/calendarlite.ts` (the learner connector), `docs/connector-authoring-guide.md`,
  ADR-0005, `docs/sprints/sprint-14.md`
