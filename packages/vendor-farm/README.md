# @relay/vendor-farm

Three **mock SaaS vendors** Relay integrates against — MailPost, SheetLite, ChatBox — each with OAuth2,
a REST API, HMAC-signed webhooks, and **configurable failure injection**. Built in Sprint 2 and abused
for the next 13 sprints.

Why fakes instead of real vendors (or a single generic mock)? Two reasons, and they're the pedagogy:

1. **Reproducible failure.** You can't ask the real MailPost to "return a 429 without a `Retry-After`
   right now." The farm makes failure a seeded, first-class test input (see `chaos.ts`).
2. **Honest inconsistency.** Real vendors don't coordinate their API design. The three below disagree on
   auth headers, pagination, and error shapes *on purpose* — so that the connector SDK (Sprint 3) has to
   be a real abstraction that absorbs the mess, not a thin wrapper over one tidy API.

Run it: `pnpm --filter @relay/vendor-farm dev` (defaults to `:4000`). Health: `GET /health`.
Every vendor shares the OAuth shape: `GET /<vendor>/oauth/authorize` (302s back with `?code&state`) and
`POST /<vendor>/oauth/token` (`authorization_code` + `refresh_token` grants). **Refresh tokens rotate** —
the presented token is revoked on success (this is what makes the Sprint 2 refresh-race real).

---

## MailPost — transactional email
- **Auth:** `Authorization: Bearer <token>`
- **Send:** `POST /mailpost/v1/emails` `{ to, subject, body }` → `202 { id, status }`
- **List:** `GET /mailpost/v1/emails?page=N` → `{ data: [...], page, has_more }` — **page-number** paging
- **Errors:** `{ "error": { "type", "message" } }`

## SheetLite — spreadsheets
- **Auth:** `X-SheetLite-Key: <token>` — *not* an `Authorization` header
- **Create row:** `POST /sheetlite/rows` `{ values }` → `201 { row }`
- **List:** `GET /sheetlite/rows?cursor=N&limit=N` → `{ rows: [...], next_cursor }` — **cursor** paging
- **Errors:** `{ "message", "code" }`

## ChatBox — team chat (Slack-shaped)
- **Auth:** `Authorization: Token <token>` — `Token`, *not* `Bearer`
- **Post:** `POST /chatbox/api/messages` `{ channel, text }` → `200 { ok: true, ts }`
- **List:** `GET /chatbox/api/messages?channel=C` → `{ ok: true, messages }`
- **Errors:** `200 { ok: false, error: "<code>" }` — logical failures are HTTP **200** with `ok:false`.
  A client that trusts status codes will treat `not_authed` as success. This is a real footgun.

---

## Failure injection (`chaos.ts`)
Per-vendor knobs, deterministic under a seed: added latency, `429` (with or without `Retry-After`),
`5xx`, and **malformed JSON** (a `200` with a truncated body — the sneakiest, because the status lies).
Dial them per test:

```ts
buildVendorFarm({ failure: { mailpost: { rate429: 0.5, retryAfterSec: 2 } }, seed: 42 });
```

## Webhooks (`hmac.ts`)
Vendors sign webhooks Stripe-style: `t=<ts>,v1=<hmac_sha256(secret, "ts.body")>`. Verification is
timing-safe and enforces a timestamp tolerance (replay defense). Relay's receiver verifies these —
though the flaw ledger records that S06 *skips* verification at first, and S13 adds it.
