# Sprint 13 Security Audit — findings

Audit-first: run the adversaries, then fix what they find. Each P1 below maps to a commit in this PR and
to a planted flaw in the ledger. Severity: P1 (exploitable now) → P4 (hygiene).

## P1 — Expression re-expansion → live secret exfiltration (flaw #1)
- **Surface:** untrusted config (the expression language).
- **Evidence:** the expression fuzzer fed a SheetLite row whose value was the literal string
  `{{connection.token}}`. The renderer's re-expansion loop then *re-evaluated* that value as a template,
  resolving `connection.token` and splicing a **live access token** into a downstream action's input —
  a data-to-code exfiltration path that aged from Sprint 4.
- **Fix:** single-pass render; resolved values are **inert data**, never re-scanned (`render.ts`). Pinned
  by a permanent fuzz corpus (`fuzz.test.ts`).

## P1 — Sandbox output channel uncapped → worker OOM (flaw #5)
- **Surface:** untrusted code (the code-step sandbox).
- **Evidence:** the poison pill `while (true) console.log('x')` accumulated captured output faster than
  the wall-clock deadline fired, OOMing the worker. Every OTHER channel (CPU, memory, time) was capped;
  output was the one that wasn't.
- **Fix:** cap captured output (bytes + lines) with a truncation marker (`runner.ts`); the guard makes the
  poison pill inert. *Limit everything the untrusted side can grow.*

## P1 — Inbound webhooks accepted UNSIGNED (flaw #4)
- **Surface:** untrusted vendors (the webhook receiver).
- **Evidence:** the receiver created runs from any POST to a binding URL, verifying nothing — for seven
  sprints. A forgery/replay probe triggered a customer's automation (and its real side effects) with a
  hand-crafted request; a captured webhook replayed successfully.
- **Fix:** HMAC signature verification + timestamp window + replay dedupe (`webhook-verify.ts`, wired into
  the receiver). Forged / replayed / stale / unsigned are all refused.

## P2 — Envelope-encryption rotation unproven
- **Finding:** the S02 envelope design *promised* KEK rotation without re-encrypting tokens, but it had
  never been executed. A design you haven't drilled is a hypothesis.
- **Action:** rotation drill via `rewrapDek` (re-wrap DEKs, tokens untouched) + runbook
  (`docs/kek-rotation-runbook.md`).

## P2 — SSRF host-only checks vulnerable to DNS rebinding
- **Finding:** allowlisting hosts doesn't stop an allowlisted host that resolves to an internal IP at
  connect time.
- **Action:** `assertResolvedIpAllowed` — resolve-and-pin the IP, re-checked on redirect (`ssrf.ts`).

## P3 — Supply-chain / secret-in-logs hygiene
- **Action:** gitleaks + dependency gates in CI (fast-forward); grep-based secret-shape check on log
  output; confirm tokens/signatures/code-step inputs are redacted (S05 `redactSecrets`).
