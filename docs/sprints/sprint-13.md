# Sprint 13 — Hardening: Chaos, Poison Pills & Secrets Audit

**Branch:** `sprint-13/hardening` · **Size:** L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** Audit-first sweep across the three attack surfaces this course created: untrusted config (expression injection), untrusted code (sandbox), and untrusted vendors (unsigned webhooks, poison payloads) — plus the secrets audit for the envelope-encryption tier. Learner runs the audit and drafts findings.

## A — Setup (audit before code)
Learner runs: the expression fuzzer (property inputs incl. `{{…}}`-laden values), the sandbox escape/exhaustion suite (S9) plus new attempts, a webhook forgery/replay probe against the receiver, a secrets review (key hierarchy, rotation, logs), and dependency/gitleaks scans. Findings → `docs/audits/sprint-13-audit.md` (commit 1, learner-drafted, AI-annotated).

## B — Commits (one finding per commit)
| # | Commit | Notes |
|---|--------|------|
| 1 | `docs: sprint-13 audit — P1..P4 with evidence` | |
| 2 | `fix(expr): single-pass render + output-as-data (P1)` | **harvests flaw #1**; fuzzer input: a SheetLite row containing `{{connection.token}}` that re-expanded into an action input — a live secret-exfiltration path; fix: resolved values are never re-scanned for templates |
| 3 | `test(expr): fuzz corpus as permanent CI — no input produces re-expansion or resolver escape` | |
| 4 | `fix(engine): sandbox output caps + truncation markers (P1)` | **harvests flaw #5**; the poison pill: `while(true) console.log('x')` OOM'd the worker; caps on captured output bytes + step-time, breach → SandboxLimitExceeded |
| 5 | `security(api): webhook signature verification + timestamp window + replay dedupe (P1)` | **harvests flaw #4**; the farm signs (HMAC), we now verify; replayed captured webhook → rejected; forged signature → rejected; out-of-window → rejected |
| 6 | `test(security): webhook forgery/replay probe as CI stage` | |
| 7 | `security(api): secret rotation — rotate master KEK without re-encrypting all DEKs; per-connection token re-encrypt tool` | the S2 envelope design's promise, executed; rotation runbook |
| 8 | `security(api): secret-in-logs audit + redaction — tokens, signatures, code-step inputs scrubbed everywhere` | grep-based CI check for known secret shapes in log output |
| 9 | `security(engine): SSRF re-review on proxied fetch — DNS-rebinding guard, IP-range denylist verified` | S9's defenses re-tested with rebinding attacks |
| 10 | `security(ci): gitleaks + dependency gates (P3, fast-forward)` | |
| 11 | `docs: threat model — the three untrusted surfaces (config, code, vendors); curriculum note` | the course's synthesis document |

## C — Review order
Audit doc → **the expression exfiltration (2–3)** — the scariest, read the fuzzer's exploit input → sandbox caps (4) → webhook verification (5) → secret rotation (7).

## D — Teaching comments (~10)
- expression re-expansion → exfiltration — 📘 the injection you don't see: user *data* flowing into a template engine that re-evaluates it; single-pass rendering + "resolved values are inert data" is the invariant; 🔗 flaw #1 planted S4, weaponized here — this is why S4 kept the grammar tiny
- fuzz corpus as CI — 🔗 every course pins its crown risk with a permanent adversary (Tracer chaos, Pulse chaos, now expr fuzz); regression = a reopened vulnerability
- sandbox output caps — 📘 resource limits must cover *every* channel: CPU, memory, time — and output; the poison pill exploited the one uncapped channel (🔗 flaw #5); "limit everything the untrusted side can grow"
- webhook verification — ⚠️ an unauthenticated inbound webhook is an unauthenticated way to trigger arbitrary customer automations (and their side effects); signature + timestamp + replay-dedupe is the standard trio (🔗 Meridian S9 taught it; here the *absence* aged 7 sprints as a live hole)
- KEK rotation — 📘 envelope encryption's payoff: rotate the master without touching a million tokens; the drill proves the design, not just the intent
- SSRF + DNS rebinding — ⚠️ allowlisting hosts isn't enough; resolve-and-pin the IP, deny internal ranges, re-check on redirect — the attacks juniors haven't heard of

## E — Debate
**"Webhook auth: HMAC signatures vs mTLS vs per-binding secret URLs?"** Secret URLs: simplest, but URLs leak (logs, referrers). mTLS: strong, vendor support spotty. HMAC: vendor-standard, verifiable, replay-guardable. **Resolution:** HMAC + timestamp window as primary, secret-URL as defense-in-depth, mTLS documented for enterprise. Lesson: *authenticate inbound machine traffic by what the sender can prove, not by what the URL hides.*

## F/G — Close
- Squash: `fix(sprint-13): hardening — expr injection, sandbox caps, webhook auth, secrets (closes #…)`
- **Recap reveals the flaw ledger** (Relay edition) — the expression flaw's 9-sprint life is the centerpiece.
- **Lab (poison-pill hunt):** learner is given a set of malicious relays/code-steps/webhooks and must classify each by which defense stops it (and find the one that still gets through → files it as the S15 follow-up).
- Ledger: flaws #1, #4, #5 closed — fully harvested.
- Recap idea: *an automation platform trusts nothing it runs — not the config, not the code, not the callers — and each distrust is a subsystem.*
