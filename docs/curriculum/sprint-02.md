# Curriculum Note — Sprint 2: Orgs, connections & the vendor farm

## Learning objectives
- Build the **honest test substrate** for an integration platform: fake vendors that fail on demand and
  disagree with each other on purpose.
- Be an **OAuth client at scale** — authorize, callback, token exchange, and the refresh lifecycle,
  including the race that every integration platform ships once.
- Store third-party secrets correctly with **envelope encryption** (DEK/KEK), and reason about blast
  radius, not just "is it encrypted."
- Treat **connection health** as stored, surfaced state — not an error discovered at run time.

## Key concepts
- **Inconsistency is the pedagogy.** MailPost, SheetLite, and ChatBox disagree on auth header,
  pagination, and error shape by design (read all three in the vendor-farm README). Real vendors don't
  coordinate; a tidy uniform mock would make the Sprint 3 connector SDK look like pointless indirection.
  The mess is the reason the abstraction earns its keep.
- **Failure injection is a first-class, seeded input.** You cannot ask the real MailPost for a 429
  without a `Retry-After`. The farm's `chaos.ts` produces reproducible failures from a seed, so tests
  assert on behavior under failure. This is the "chaos always on" rule — every integration test runs
  through the knobs, not just S13.
- **The refresh race** (the arc). Refresh tokens usually **rotate**: using one revokes it. So two
  concurrent refreshes self-inflict a revocation — the first rotates the token the second is about to
  present, and the second fails, sometimes killing the whole connection. The fix is **single-flight**:
  one refresh per connection; other callers await its result. See `oauth-refresh.test.ts` — it shows
  the naive failure *and* the fix against the farm's real rotating server.
- **Envelope encryption** (ADR-0004). A per-org **DEK** encrypts tokens; a master **KEK** (never in the
  DB) only encrypts DEKs. Payoffs: rotate the KEK without re-encrypting the world (re-wrap tiny DEKs);
  blast radius is one org; a DB dump alone is useless. AES-GCM's auth tag makes tampering fail closed.
- **Connection health is stored, not computed at 3am.** Connections rot — users revoke, scopes change,
  vendors churn. When a refresh fails, we *record* `unhealthy`. A run failing tonight because of a
  connection that died Tuesday, with no prior signal, is a product failure. Surface rot early.
- **`state` present from the start.** The OAuth `state` param (CSRF defense) is just… there, correct,
  from the first commit. 🔗 Tracer taught this via a planted login-CSRF bug; here it's inherited
  knowledge. That's what learning looks like in git history.

## Exercise questions
1. ChatBox returns `200 { ok: false, error: "not_authed" }` on auth failure. Write the one-line client
   bug this causes, and how a connector definition (S3) should normalize it.
2. Walk the refresh race step by step with two callers sharing one refresh token. At which instant is
   the second caller's token revoked? Why does single-flight avoid it without locking the database?
3. A DB dump leaks the `Connection` and `Organization` tables but not the KEK. What exactly can the
   attacker do? Now they also get the KEK — what changes, and what does KEK rotation cost afterward?
4. Why store connection health rather than probing the vendor when a run starts? Give a cost and a
   correctness reason.

## Deferred (each a linked issue)
- Connection re-auth UX, scope-upgrade flow, KEK rotation execution (S13), per-org OAuth apps (the
  enterprise variant from the debate).

## Further reading
- OAuth 2.0 authorization-code flow & refresh-token rotation (RFC 6749/6819) · Envelope encryption &
  KMS patterns · Request coalescing / single-flight · Webhook signature schemes (HMAC + timestamp)
