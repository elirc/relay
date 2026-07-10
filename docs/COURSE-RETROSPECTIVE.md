# Relay — Course Retrospective (v1.0.0)

Fifteen sprints, fifteen pull requests, one system: a Zapier-class workflow-automation platform built
from a hardcoded two-step relay into a durable, multi-tenant, sandboxed, certified-connector engine —
with every architectural decision written down and every shortcut deliberately planted and later
harvested. This document closes Course 4: it reviews the durable-execution arc, tallies the idempotency
thread, tells the flaw-ledger story, and points at v2.

If you studied along, do your authoring retro (S14) and the poison-pill lab (S13) before reading v2 ideas.

---

## The arc: naive → durable

| Phase | Sprints | What you built | The reckoning |
|-------|---------|----------------|---------------|
| Foundation | S01–S05 | Monorepo, the hardcoded walking skeleton, connections + the vendor farm, connector SDK, builder + safe expressions, engine v1 | Ship an engine that works **and document exactly how it can lie** |
| The turn | S06–S07 | Triggers at scale, then **durable runs** (checkpoints, idempotency, replay) | The S05 duplicate-email arc, **closed** — the conceptual peak |
| Product depth | S08–S12 | The DAG, the sandbox, fan-out + offloading, rate limits + fairness, debugging + metering | Features are cheap on a durable spine; each is a new subsystem |
| Hardening & scale | S13–S15 | The three-surface security audit, connector certification, production readiness | Harvest the debt, certify the ecosystem, operate the promise |

The through-line: we built the *naive* engine (S01–S05) so the migration to durable execution (S07) had
something real — and something visibly broken — to migrate. You can't learn the hard version without
first shipping the easy one and feeling it fail.

---

## The idempotency thread (the course's spine)

"Don't do it twice" recurs at every layer, and tracing it is the whole course:
- **Declared** in the connector SDK (S03): every action states `vendorKey | naturalKey | dedupeWindow`.
- **Enforced** by the durable engine (S07): a stable key travels with the side effect to the vendor, the
  arbiter that closes the crash window.
- **Applied to triggers** (S06): dedupe keys so a trigger firing twice doesn't run an automation twice.
- **Applied to money** (S12): metering keyed on `(run, step)`, so a retry or replay never double-bills.
- **Applied at ops scale** (S15): safe bulk DLQ replay — 10,000 dead-lettered runs re-run with zero
  duplicate side effects.
One idea — *a stable key makes a repeat safe* — worn as a different costume in every sprint.

---

## The flaw ledger, revealed and closed

Five flaws planted on purpose, each weaponized to teach *why* a defense exists (full reveal:
`docs/threat-model.md`).

| # | Planted | The debt | Harvested | The lesson it taught |
|---|---------|----------|-----------|----------------------|
| 1 | S04 | expression re-expansion → **live secret exfiltration** (9 sprints — the centerpiece) | S13 | user data through a template engine must stay data; single-pass render |
| 2 | S05 | step outputs inline as JSONB → runs-table bloat | S10 | databases are bad blob stores; offload, keep the ref |
| 3 | S06 | polling cursor per-relay → double-poll | S11 | duplication is usually a wrong-identity bug; key by the resource |
| 4 | S06 | unsigned webhooks → forged/replayed triggers (7 sprints) | S13 | authenticate by what the sender can prove, not what the URL hides |
| 5 | S09 | uncapped sandbox output → worker OOM | S13 | limit *every* channel the untrusted side can grow |

**Why plant flaws?** Because a defense taught as a lecture doesn't land; a defense taught as *the leak you
shipped* does. Flaw #1 is the sharpest: a perfectly small S04 grammar still had a re-expansion hole that
aged nine sprints into a secret-exfiltration path — and *that's* why the grammar was kept tiny.

---

## The three untrusted surfaces (the synthesis)

An automation platform trusts nothing it runs — and each distrust is its own subsystem (`threat-model.md`):
- **Config** (expressions): closed grammar, structured operators, single-pass render, a fuzz corpus.
- **Code** (the sandbox): subtraction-not-addition surface, outside-the-guest limits on *every* channel,
  one gated egress door with SSRF + resolved-IP pinning.
- **Vendors** (connections + webhooks): closed error taxonomy + retries, HMAC + timestamp + replay,
  envelope-encrypted tokens with KEK rotation.

---

## Competency map, revisited

By v1.0 you have shipped, and can defend the tradeoffs of: durable execution (checkpoint/resume/replay) ·
idempotency against systems you don't control · a declarative connector SDK + certification ·
DAG modeling & topological execution · sandboxing untrusted code · safe expression/rule languages ·
distributed rate limiting & multi-tenant fairness · envelope encryption + key rotation · webhook
security · usage metering as a contract · run-lifecycle observability · incident response & blameless
postmortems. That is a mid-to-senior backend surface, and — in S14 — **you shipped a piece of it under the
same certification bar as the author.** That transition is what this curriculum exists to produce.

---

## v2 ideas (and Course 5)
- **Adopt Temporal/Restate** — now a knowledgeable migration (ADR-0009): map our hand-rolled
  checkpoint/resume/replay to their primitives and decide deliberately.
- **Connector marketplace** — the certification tiers (S14) are the foundation; add discovery, telemetry,
  and an OAuth scope-minimization linter.
- **Visual debugger** — the resolution trace (S12) + DAG (S08) + replay-from-node, in a real UI.
- **Nested fan-out & streaming aggregation** (S10 deferrals) for very large data workflows.

**Next course:** Harbor (an Intercom-class support platform) or Folio (a Notion-style collaborative
editor) — the durable/idempotency/security habits transfer; the domain does not.

> Operating an automation engine is watching one promise at scale — every run resumes correctly, or you
> get paged before the customer notices.
