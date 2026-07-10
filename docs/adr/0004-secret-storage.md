# ADR-0004: Envelope encryption for connection tokens (per-org DEK, master KEK)

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S02
- **Deciders:** Relay authors

## Context
Relay stores OAuth access/refresh tokens for thousands of orgs. Those tokens are bearer credentials to
someone else's account — a leak is a breach of *our users' vendors*, not just of Relay. Requirements:
tokens never at rest in plaintext; a database dump alone must not yield usable tokens; and we must be
able to rotate the master secret without a multi-day re-encryption of every row.

## Decision
**Envelope encryption** (`packages/secrets`). Two key tiers:
- a **DEK** (data encryption key), one per org, that encrypts that org's tokens (AES-256-GCM);
- a **KEK** (key encryption key), the single master secret, that only ever encrypts DEKs.

We store each org's DEK *wrapped* by the KEK. The KEK lives in memory / a KMS, **never in the
database**. To use a token: unwrap the org DEK with the KEK, decrypt the token with the DEK. The DEK is
generated lazily on the org's first secret. AES-GCM's auth tag gives integrity for free — tampered
ciphertext fails to decrypt rather than returning garbage.

## Alternatives considered
- **Encrypt every token directly with one master key.** Simpler, but rotating that key means
  re-encrypting every token in the system, and one key is a single catastrophic secret with no blast-
  radius containment.
- **Store tokens in plaintext / rely on disk encryption.** Disk encryption protects against a stolen
  disk, not against a leaked query result, a logged row, or a compromised replica. Useless for the
  actual threat model (a DB dump).
- **Per-connection keys.** Finer blast radius, but far more key material to manage for marginal benefit
  over per-org; org is the natural tenancy boundary.

## Consequences
- **Rotate the KEK without re-encrypting the world** — re-wrap each org's (tiny) DEK; token ciphertext
  is untouched (proven by a test). Full KEK rotation is executed in S13.
- **Blast radius** — one org's leaked DEK exposes only that org.
- **A DB leak alone is useless** — it yields wrapped DEKs + ciphertext; without the KEK, nothing opens.
- The KEK becomes the crown-jewel secret: its handling (KMS, rotation, access) is the thing to get
  right operationally. Related: the S02 **debate** resolved to use *shared* OAuth app credentials per
  vendor (product norm) with those secrets in the KEK tier and per-vendor kill switches — because
  *multi-tenant secrets need blast-radius design, not just encryption.*

## Links
- `packages/secrets/` (+ tests), `apps/api/src/secrets.ts`, `apps/api/src/oauth-client.ts`,
  ADR-0003 (vendor farm), `docs/sprints/sprint-02.md`
