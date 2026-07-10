# Curriculum Note — Sprint 13: Hardening (chaos, poison pills & secrets audit)

## Learning objectives
- Run an **audit-first** security sweep: adversaries before fixes.
- Understand the course's three **untrusted surfaces** as one synthesis.
- Weaponize and then close the planted flaws — see *why* each early defense existed.

## Key concepts
- **The injection you don't see: data flowing into a template engine that re-evaluates it (flaw #1).**
  The scary one. A vendor row containing the literal `{{connection.token}}` was re-expanded by the
  renderer's loop and spliced a live secret into an action input. The fix is one invariant: **single-pass
  render — resolved values are inert data.** This is *why* S04 kept the grammar tiny; a bigger surface
  here would have been a bigger exfiltration. Pinned forever by a fuzz corpus, because a regression is a
  reopened vulnerability. (🔗 every course pins its crown risk with a permanent adversary.)
- **Limit EVERY channel the untrusted side can grow (flaw #5).** The sandbox capped CPU, memory, and
  time — and forgot output. The poison pill `while(true) console.log()` exploited the one uncapped
  channel to OOM the worker before the deadline fired. Resource limits are only as strong as the channel
  you forgot. Now output is capped too.
- **An unauthenticated inbound webhook is an unauthenticated trigger for arbitrary automations (flaw #4).**
  The receiver verified nothing for seven sprints — a forged or replayed request could fire a customer's
  relay and all its real side effects. The standard trio closes it: **signature** (authenticity) +
  **timestamp window** (freshness) + **replay dedupe**. *Authenticate inbound machine traffic by what the
  sender can prove, not by what the URL hides.*
- **Envelope encryption's payoff is proven, not just claimed.** KEK rotation re-wraps the tiny per-org
  DEKs and touches **zero token ciphertext** — the S02 design executed. A design you haven't drilled is a
  hypothesis; the drill (and runbook) turn it into a capability.
- **SSRF: allowlisting hosts isn't enough — pin the IP.** DNS rebinding lets an allowlisted host resolve
  to 127.0.0.1 at connect time. Resolve-and-pin the IP, deny internal ranges, re-check on redirect.
- **Three surfaces, three subsystems.** Config, code, callers — the platform trusts none of them, and each
  distrust is its own set of defenses (see `docs/threat-model.md`). That's the whole course, viewed as
  one security posture.

## The flaw ledger, revealed (Relay edition)
| # | Planted | Weaponized here | Fix |
|---|---------|-----------------|-----|
| 1 | S04 | expression re-expansion → secret exfiltration (9 sprints) | single-pass render + fuzz corpus |
| 4 | S06 | unsigned webhooks → forged/replayed triggers (7 sprints) | HMAC + timestamp + replay dedupe |
| 5 | S09 | uncapped sandbox output → worker OOM | output caps + truncation |

## The debate, cashed
**Webhook auth: HMAC vs mTLS vs secret URLs.** Resolved: HMAC + timestamp window primary, secret-URL as
defense-in-depth, mTLS documented for enterprise. *Authenticate by what the sender can prove, not by what
the URL hides.*

## Lab (`lab/sprint-13`, poison-pill hunt)
Given malicious relays/code-steps/webhooks, classify each by which defense stops it — and find the one
that still gets through, filed as the S15 follow-up.

## Exercise questions
1. Trace the flaw #1 exploit end to end: where does the secret enter as data, and where would it have left
   as a resolved token? Why does single-pass rendering close it and a denylist wouldn't?
2. The sandbox capped CPU/memory/time but not output. State the general rule this violated, and list every
   channel you'd audit for a new untrusted surface.
3. Why does webhook auth need all three of signature, timestamp, and replay-dedupe? Give an attack each one
   alone fails to stop.
4. Why can KEK rotation skip re-encrypting tokens? What would you be doing wrong if you found yourself
   re-encrypting them?

## Further reading
- SSTI / template injection · Resource-limit completeness · Webhook security (Stripe's signature scheme) ·
  Envelope encryption & key rotation · DNS rebinding · Threat modeling (STRIDE)
