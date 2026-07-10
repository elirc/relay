# Relay Threat Model — the three untrusted surfaces

The synthesis document (S13). An automation platform **trusts nothing it runs** — not the config, not the
code, not the callers — and each distrust is its own subsystem. Every security decision in this course
maps to one of three surfaces.

## 1. Untrusted config — the expression language
Users author `{{path}}` mappings, and untrusted vendor *data* flows through them constantly.
- **Threat:** template injection / data-to-code exfiltration (flaw #1 — a row containing
  `{{connection.token}}` re-evaluated into an action input).
- **Defenses:** a closed, paths-only grammar (S04); structured conditions/array-ops as data, not strings
  (S08/S10); **single-pass render — resolved values are inert data** (S13); a permanent fuzz corpus.
- **Invariant:** *user data flowing through the renderer stays data.*

## 2. Untrusted code — the sandbox
Code steps run arbitrary user JavaScript inside the engine.
- **Threats:** runtime escape (`constructor.constructor`), resource exhaustion (CPU/memory/time/**output**
  — flaw #5), SSRF via the network door (cloud-metadata credential theft, DNS rebinding).
- **Defenses:** subtraction-not-addition surface (grant only `input`/`console`); outside-the-guest
  deadline; **all channels capped, including output** (S13); egress through one gated proxy with a
  blocklist + allowlist + resolved-IP pin (S09/S13); isolated-vm in production (ADR-0011).
- **Invariant:** *the untrusted side starts with nothing and can grow nothing without a cap.*

## 3. Untrusted vendors — connections & webhooks
The vendors we call and that call us are flaky and, for inbound, unauthenticated by default.
- **Threats:** forged/replayed inbound webhooks triggering arbitrary automations (flaw #4); malformed /
  poison payloads; token theft from a DB leak.
- **Defenses:** the closed error taxonomy + retries (S03/S05); **webhook HMAC signature + timestamp
  window + replay dedupe** (S13); envelope-encrypted tokens with KEK rotation (S02/S13); connection
  health as stored state (S02).
- **Invariant:** *authenticate inbound machine traffic by what the sender can prove, not by what the URL
  hides.*

## The flaw ledger, revealed
Three flaws were planted early and weaponized here to teach *why* each defense exists:
- **#1 (S04→S13):** expression re-expansion, the 9-sprint exfiltration path — the centerpiece.
- **#4 (S06→S13):** unsigned webhooks — an auth hole that aged seven sprints as a live vulnerability.
- **#5 (S09→S13):** the uncapped sandbox output channel — the poison pill.
Each is now closed, each with a permanent test so a regression is a reopened vulnerability.
