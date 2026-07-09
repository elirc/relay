# Relay — Workflow Automation Platform (Zapier Lite)

## Project Spec & 15-Sprint Upskilling Curriculum (Course 4)

**Version:** 1.0 · **Date:** 2026-07-09 · **Folder:** `relay/` (splits into its own repo later)

---

## 1. Purpose

Fourth course. Same model (AI authors everything; junior predicts, reviews-before-reveal, runs labs, co-authors from S8).

**What this course uniquely teaches:**

- **DAG/workflow orchestration** — durable multi-step runs, checkpointing, resume, replay
- **Running untrusted user configuration safely** — sandboxed user code, resource limits, secret hygiene
- **Connector adapter farms** — a declarative SDK that makes the 10th integration 10× cheaper than the 1st
- **Retry semantics at scale** — per-step retries, idempotent side effects against systems you don't control, DLQs, fairness

**Signature teaching arc:** side effects against *external* systems make idempotency existential rather than hygienic. Meridian retried its own database; Relay retries "send an email via someone's account" — the difference is the curriculum. A **mock vendor farm** (three fake SaaS products with OAuth, APIs, webhooks, and configurable failure modes) is built in S2 and abused for 13 sprints.

> Functional clone of the Zapier category (triggers, actions, multi-step workflows, connector ecosystem) — no branding or assets. Product name: **Relay**.

## 2. Product Overview

**Personas:** Builder (creates workflows) · Org Admin (connections, billing) · **the vendor APIs** (the flaky, rate-limited co-stars).

**Core domains:** connections (OAuth to vendors) → connectors (declarative trigger/action definitions) → workflows ("relays": trigger → steps, later branching DAGs) → the execution engine (durable runs, retries, checkpoints) → run history & debugging → code steps (sandboxed JS) → quotas, fairness & metering.

## 3. Tech Stack

| Layer | Choice | Teaching rationale |
|---|---|---|
| Language / repo | TypeScript strict · pnpm + Turborepo | carried |
| Web app | Next.js (builder UI; graph editor for DAGs) | carried |
| API | Fastify | carried |
| Engine | **BullMQ + Redis**, dedicated `apps/engine` worker fleet | queues graduate from utility to *product core* |
| DB | PostgreSQL + Prisma (runs, checkpoints, connections) | run state is OLTP, checkpoint-heavy |
| Sandbox | **isolated-vm** (fallback: worker_threads + resource caps), no ambient I/O, fetch via proxied allowlist | untrusted code is the S9 centerpiece |
| Vendor farm | **`packages/vendor-farm`** — 3 mock SaaS apps (MailPost, SheetLite, ChatBox) with OAuth2, REST, webhooks, HMAC, and **configurable failure injection** (latency, 429s, 5xx, malformed payloads) | integrations tested honestly (🔗 Meridian S9's simulator, industrialized) |
| Secrets | Envelope encryption (per-org DEK, master KEK) for connection tokens | secret storage done properly, audited S13 |
| Templating | Hand-rolled safe expression language (`{{steps.1.output.email}}`) — **no eval, ever** | injection-proof by construction |
| Testing / CI / observability | carried; plus engine-specific chaos + load | |

**Layout:** `apps/{web,api,engine}`, `packages/{connector-sdk,connectors,vendor-farm,expr,db,shared,config}`, `docs/{adr,curriculum,sprints,runbooks,audits}`.

## 4. Curriculum deltas

1. **External side effects rule:** any step that calls a vendor must declare its idempotency strategy (natural key, vendor idempotency header, or best-effort-with-dedup-window) in the connector definition. Reviewed like a type signature.
2. **Failure injection is always on** in tests: the vendor farm's chaos knobs are part of every integration test, not just S13.
3. **The learner ships a connector solo** in S14 against the certification harness — the course's practical exam.
4. Labs after S4, S7, S9, S11, S13.

### Competency additions

| Competency | Taught in |
|---|---|
| OAuth *client* at scale (many vendors, refresh, revocation) | S2, S11 |
| Declarative plugin SDKs & registries | S3, S14 |
| Durable execution: checkpoint/resume/replay | S5, S7 |
| DAG modeling & topological execution | S8 |
| Sandboxing untrusted code | S9 |
| Safe template/expression languages | S4, S10 |
| Vendor rate-limit respect; fairness & noisy neighbors | S11 |
| Secret storage (envelope encryption) | S2, S13 |
| Poison-pill & replay-attack defense | S13 |
| Usage metering ("tasks") & quotas | S12 |

## 5. Domain Model (reference)

```
Organization ─┬─ User · Connection (vendor, tokens encrypted, health)
              ├─ Relay (workflow) ─┬─ Version (immutable graph: nodes, edges, config)
              │                    ├─ TriggerBinding (webhook sub | polling cursor | schedule)
              │                    └─ Run ─┬─ StepRun (status, attempt, checkpointed output ref)
              │                            └─ RunEvent (append-only execution log)
              ├─ CodeStep (user JS, versioned)
              └─ UsageRecord (task metering)
Connector (registry) ─ triggers[] · actions[] · auth def · schemas (zod)
```

## 6. Sprint map

| # | Sprint | Phase | Size | Headline |
|---|---|---|---|---|
| 1 | Foundation & hardcoded two-step relay | MVP | S | Skeleton runs webhook→action end to end |
| 2 | Orgs, connections & the vendor farm | MVP | L | OAuth client, envelope-encrypted tokens, 3 mock vendors |
| 3 | Connector SDK v1 + first two connectors | MVP | L | Declarative defs; the registry |
| 4 | Builder v1: linear relays + expressions | MVP | L | Field mapping, safe templating, test-run mode |
| 5 | Engine v1 + run history → `v0.5.0` | MVP | M/L | Queued execution, step logs, deploy |
| 6 | Triggers at scale: polling, webhooks, schedules | Full | L | Cursors, dedupe, auto-subscription |
| 7 | Engine v2: durable runs (flagship) | Full | XL | Checkpoint/resume, idempotent side effects, replay |
| 8 | Branching & the DAG (dialogue) | Full | L | Paths, filters, topological execution |
| 9 | Code steps: the sandbox | Full | L | isolated-vm, limits, no ambient I/O |
| 10 | Data mapping v2: arrays, loops, large payloads | Full | M/L | Fan-out steps, payload offloading |
| 11 | Rate limits & fairness | Full | L | Vendor budgets, org quotas, priority queues |
| 12 | Run debugging & metering | Full | M/L | Replay UI, alerting on failures, task billing |
| 13 | Hardening: chaos, poison pills & secrets audit | Full | L | Audit format; replay attacks, sandbox escape review |
| 14 | Connector farm at scale + learner certification | Full | L | Versioning, test harness, learner ships one solo |
| 15 | Production readiness → `v1.0.0` | Full | L | Engine observability, stuck-run drill, runbooks |

## 7. Open questions (decide before Sprint 1)

1. isolated-vm build complexity on Windows dev machines — fallback to worker_threads acceptable?
2. Vendor farm as separate deployable for staging (more realistic) or in-process for CI speed? (Spec assumes: both, via adapter.)
3. Does the learner's S14 connector target a mock vendor or a real free API (e.g., a weather API)?
