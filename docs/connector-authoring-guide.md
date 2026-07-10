# Connector Authoring Guide (v1)

This guide is written for a stranger — and in Sprint 14, the course's learner *is* that stranger: you
will ship a connector solo against a certification harness. If this guide is good, you'll succeed without
asking anyone. Start by reading the two built-in connectors side by side: `packages/connectors/src/`.

## Anatomy of a connector

```ts
export const myVendor = defineConnector({
  key: "myvendor",                 // stable id
  name: "MyVendor",
  auth: { type: "header", name: "authorization", format: (t) => `Bearer ${t}` },
  basePath: "/myvendor",           // path under the vendor root
  actions: [ /* defineAction(...) */ ],
  triggers: [ /* declarative for now; poll()/webhook parsing land in S06 */ ],
});
```

## Writing an action

```ts
defineAction({
  key: "send-thing",
  name: "Send Thing",
  input:  z.object({ to: z.string().email(), body: z.string() }),
  output: z.object({ id: z.string() }),
  idempotency: { strategy: "vendorKey", header: "Idempotency-Key" },   // MANDATORY — see below
  execute: async (ctx, input) => {
    const res = await ctx.http.request({ method: "POST", path: "/things", body: input });
    return { id: (res.body as { id: string }).id };
  },
});
```

### Rules (the harness enforces these)
1. **Declare idempotency. Always.** Pick the strongest available:
   - `vendorKey` — the vendor accepts an idempotency header. Forward `ctx.idempotencyKey`. *(easiest —
     the vendor dedupes)*
   - `naturalKey` — the vendor has none; derive a stable key from the input (a content hash). *(you
     dedupe — the engine uses your key)*
   - `dedupeWindow` — last resort; best-effort suppression within a window.
   The choice is reviewed like a type signature. Ask: *if the engine retries this after a crash, does
   the user get one thing or two?*
2. **Never call `fetch` directly. Use `ctx.http`.** That's where auth, error normalization, and (S11)
   rate limiting live. A lint rule forbids raw `fetch` in `packages/connectors`.
3. **Trust the taxonomy, not status codes.** `ctx.http` throws a `ConnectorError` with a `kind`
   (`RateLimited | AuthFailed | VendorDown | BadInput | Unknown`). Don't branch on `res.status`
   yourself — that's how ChatBox's `200 { ok:false }` slips through.
4. **Schemas are contracts.** `input`/`output` are validated, turned into UI forms (S04), and
   documented. Keep them tight (`z.string().email()`, not `z.string()`).
5. **Pagination is solved.** Use `ctx.http.paginate(spec, adapter)` with `cursorPaginer` / `pagePaginer`.
   Don't hand-roll paging loops.

## Testing your connector
Drive `action.execute` with a fake `fetch` (see `connectors.test.ts`): assert the happy path AND the
chaos cases (429 → `RateLimited`, malformed → `VendorDown`, 401 → `AuthFailed`). Chaos-always-on.

---

## v2: Versioning & Certification (S14)

### Version your connector
Declare a `version` (semver). Relays pin it, so a **breaking schema change is a MAJOR bump** — never
silently reshape an action's input/output on the same version. Set `deprecated: true` to start a
deprecation window; pinned relays keep working.

### The certification harness is your rubric
Run `certifyConnector(yourConnector)` (see `packages/connectors/src/certify.test.ts`). It checks:
- **safety (must pass, any tier):** every action declares `idempotency`; every trigger declares
  `dedupeKey`; a header `auth` scheme; a valid semver.
- **quality (first-party bar):** object input/output schemas; a `basePath`.

A connector that fails a **safety** check cannot ship in *any* tier. Quality gaps drop you to the
community tier, clearly labeled — the safety floor never lowers.

### The certification checklist (for the stranger)
1. `version` is semver.
2. `auth` is a header scheme with a `format`.
3. Every action: tight `input`/`output` zod object schemas + an `idempotency` strategy (strongest
   available — `vendorKey` > `naturalKey` > `dedupeWindow`).
4. Every trigger: a `dedupeKey` that captures the vendor's item identity.
5. `execute` uses ONLY `ctx.http` (never raw `fetch`); trust the error taxonomy, not status codes.
6. `certifyConnector(...)` returns `strictPass: true`.

If you can produce a `strictPass: true` connector from this guide alone, the guide works — and so do you.
