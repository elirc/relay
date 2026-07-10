# ADR-0003: A mock vendor farm with failure injection, not real vendors or a generic mock

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S02
- **Deciders:** Relay authors

## Context
Relay's whole job is talking to third-party SaaS APIs. To build and test that honestly we need vendors
that (a) fail on demand, reproducibly, and (b) disagree with each other the way real vendors do. Real
vendors give us neither: you can't ask Gmail to return a 429-without-Retry-After right now, and testing
against live accounts is slow, rate-limited, and flaky in CI.

## Decision
Build **`packages/vendor-farm`**: three mock vendors — **MailPost** (email), **SheetLite** (sheets),
**ChatBox** (chat) — each with OAuth2 (code + rotating refresh), a REST API, HMAC-signed webhooks, and
**seeded failure injection** (latency, 429 ±Retry-After, 5xx, malformed JSON). Two design choices carry
the pedagogy:

- **Deliberate inconsistency.** The three disagree on auth header (`Bearer` vs `X-SheetLite-Key` vs
  `Token`), pagination (page vs cursor vs none), and error shape (`{error:{type}}` vs `{message,code}`
  vs `{ok:false}` at HTTP 200). This is realism, and it's what forces the Sprint 3 connector SDK to be
  a real abstraction rather than a wrapper over one tidy API.
- **Failure is a first-class, seeded input.** Given a seed, the same failures reproduce — so a test can
  assert "under these conditions, the client retries correctly." This backs the course rule that
  **failure injection is always on** in integration tests, not saved for the hardening sprint.

The farm is one Fastify app; it deploys standalone for staging AND `inject()`s in-process for CI —
same code, no network required.

## Alternatives considered
- **Test against real vendor sandboxes.** Most realistic, but rate-limited, credential-heavy, flaky,
  and impossible to drive into specific failure modes. Great for a final smoke test, useless as the
  everyday substrate.
- **One generic mock with a uniform API.** Easy, but it would *hide* the exact problem the course
  exists to teach: absorbing vendor inconsistency. A tidy mock makes the connector SDK look like
  pointless indirection.
- **Record/replay (VCR-style fixtures).** Good for pinning a known interaction, but you can't easily
  synthesize failures that never happened to be recorded, and fixtures rot.

## Consequences
- We maintain three fake APIs — real cost — but they pay for themselves every sprint as the honest
  substrate for retries (S07), rate limits (S11), and chaos (S13).
- Rotating refresh tokens in the OAuth server make the S02 refresh-race reproducible rather than
  hypothetical.
- **Revisit if** we add a real vendor integration for the learner's certification (S14) — likely a
  read-only free API — layered *alongside* the farm, not replacing it.

## Links
- `packages/vendor-farm/` (+ README as external API docs), ADR-0004 (secret storage),
  `docs/sprints/sprint-02.md`
