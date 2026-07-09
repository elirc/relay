# Sprint 02 — Orgs, Connections & the Vendor Farm

**Branch:** `sprint-02/connections-vendor-farm` · **Size:** L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** Build the co-stars: three mock SaaS vendors (MailPost, SheetLite, ChatBox) with OAuth2, REST APIs, webhooks, and failure-injection knobs. Then the Connection model: Relay as an *OAuth client* at scale, tokens envelope-encrypted, refresh handled correctly — including the refresh-race arc.

## A — Issues
1. `packages/vendor-farm: 3 mock vendors — OAuth2 (code flow + refresh), REST, HMAC webhooks, failure knobs`
2. `Org/user auth (fast-forward) + Connection model (encrypted tokens, health status)`
3. `OAuth connect flow UI: authorize → callback → connection stored`
4. `Token refresh on expiry; secrets: envelope encryption`

## B — Commits
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(vendor-farm): MailPost — oauth2 server, send/list emails API, HMAC-signed webhooks` | each vendor has a README written as external API docs (🔗 Meridian S9's convention) |
| 2 | `feat(vendor-farm): SheetLite (rows CRUD, row-created webhook) + ChatBox (post message, channel events)` | deliberately *inconsistent* APIs — different pagination, different error shapes, different auth header names; realism is the pedagogy: the connector SDK (S3) must absorb this |
| 3 | `feat(vendor-farm): failure injection — per-vendor knobs: latency, 429 (with/without Retry-After), 5xx, malformed JSON, token revocation` | deterministic under seed for CI |
| 4 | `feat(api): org/user auth (fast-forward, compressed)` | |
| 5 | `feat(db): Connection — vendor, encrypted tokens, expiry, health, scopes` | |
| 6 | `feat(api): envelope encryption — per-org DEK wrapped by master KEK; tokens never at rest in plaintext` | key hierarchy diagram in body; rotation story sketched (executed S13) |
| 7 | `feat(api+web): connect flow — authorize redirect, callback, token exchange, connection card UI` | state param present from the start (🔗 Tracer S2's arc, learned) |
| 8 | `feat(api): token refresh on 401/expiry — [naive: refresh inline wherever needed]` | **[fix-later-in-PR]** |
| 9 | `test(api): two concurrent calls hit expiry → both refresh → vendor revokes first token → one fails, FAILS` | the refresh race, made real by the farm's rotate-on-refresh behavior |
| 10 | `fix(api): per-connection refresh mutex + single-flight refresh` | one refresher, others await the fresh token |
| 11 | `test(api): connection health — revoked-token detection marks connection unhealthy + surfaces in UI` | |
| 12 | `docs: ADR-0003 vendor farm design; ADR-0004 secret storage; curriculum note` | |

## C — Review order
Vendor inconsistency (2 — read all three READMEs) → failure knobs (3) → envelope encryption (6) → **the refresh race (8→9→10)**.

## D — Teaching comments (~11)
- inconsistent-by-design — 📘 real vendors don't coordinate; the farm's inconsistency is what makes S3's SDK a real abstraction instead of a wrapper
- failure knobs — 📘 you can't unit-test "vendor returns 429 without Retry-After" against a real vendor; simulators make failure a first-class test input (🔗 chaos-always-on rule)
- envelope encryption — 📘 DEK/KEK separation: rotate the master without re-encrypting the world; what the DB leak scenario looks like with and without it
- refresh race — ⚠️ the OAuth-client bug every integration platform ships once: refresh tokens are often single-use; concurrent refresh = self-inflicted revocation; single-flight is the shape of the fix
- connection health — 🔍 review-lens: connections rot (revoked, descoped, vendor churn); health must be a *stored, surfaced* state, not an error at run time — a run failing at 3am because of a connection that died Tuesday is a product failure
- state param present — 🔗 pattern transfer: Tracer taught this via an arc; here it's just… correct. That's what learning looks like in git history

## E — Debate
**"One shared OAuth app per vendor vs per-org credentials?"** Shared: one consent screen, our brand — but one compromised secret affects everyone. Per-org: blast-radius isolation, setup friction. **Resolution:** shared (the product norm) with the secret in the KEK tier and per-vendor kill switches; per-org documented as the enterprise feature it usually becomes. Lesson: *multi-tenant secrets need blast-radius design, not just encryption.*

## F/G — Close
- Squash: `feat(sprint-02): connections, oauth client, vendor farm (closes #…)`
- Deferred: connection re-auth UX, scope upgrade flow.
- Recap idea: *we built our own flaky vendors so failure is reproducible — the farm is the course's gravity.*
