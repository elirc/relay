# Relay

A workflow-automation platform (a Zapier-class clone: triggers, actions, multi-step "relays", a
connector ecosystem, and a durable execution engine) — built as a **15-sprint upskilling curriculum**,
where every sprint is one pull request loaded with teaching artifacts: heavily annotated code, ADRs,
planted-then-harvested design debt, and inline review commentary.

> **This repo is a course.** The code is real and runs; the commit history, PR comments, ADRs, and
> curriculum notes are the actual product. Read it in order and you go from junior to mid/senior on
> backend orchestration. Start with [`docs/LEARNER-GUIDE.md`](docs/LEARNER-GUIDE.md).

**Course 4** of a larger curriculum (following Tracer). Status: **complete — `v1.0.0`.** All 15 sprints
shipped as merged PRs. See [CHANGELOG.md](CHANGELOG.md) and the
[Course Retrospective](docs/COURSE-RETROSPECTIVE.md).

## What it will teach
- **Durable execution** — runs that checkpoint, resume, and replay across process death (S5, S7).
- **Idempotency against systems you don't control** — retrying "send an email via someone's account"
  without double-sending (S7, and every connector from S2 on).
- **Running untrusted user code safely** — sandboxed JS code steps with resource limits, no ambient I/O
  (S9).
- **Connector adapter farms** — a declarative SDK that makes the 10th integration 10× cheaper than the
  1st; the learner ships one solo against a certification harness (S3, S14).
- **Retry semantics, rate limits, fairness, and metering** at scale (S6, S11, S12).

## Planned stack
- **Monorepo:** pnpm workspaces + Turborepo · TypeScript strict · Node
- **Web:** Next.js (builder UI, DAG graph editor) — `apps/web`
- **API:** Fastify — `apps/api`
- **Engine:** BullMQ + Redis, a dedicated worker fleet — `apps/engine`
- **Data:** PostgreSQL + Prisma (runs, checkpoints, connections) — `packages/db`
- **Sandbox:** isolated-vm (code steps) — no ambient I/O
- **Vendor farm:** three mock SaaS apps with OAuth2/REST/webhooks/HMAC + configurable failure injection
  — `packages/vendor-farm`
- **Expressions:** a hand-rolled safe template language (`{{steps.1.output.email}}`) — **no `eval`, ever**
- **Secrets:** envelope encryption (per-org DEK, master KEK) for connection tokens

## Course docs
- [`docs/LEARNER-GUIDE.md`](docs/LEARNER-GUIDE.md) — how to study the repo (predict-before-reading, labs)
- [`SPEC.md`](SPEC.md) — product spec, domain model, competency additions
- [`docs/sprints/`](docs/sprints/) — the 15 sprint playbooks + the ritual (`00-workflow.md`)
- [`docs/adr/`](docs/adr/) — architectural decisions (added as sprints merge)
- [`githelp.md`](githelp.md) — the git/GitHub operator manual for driving each sprint

## The signature idea
> Side effects against *external* systems make idempotency existential rather than hygienic. A run
> executes steps; if the engine dies mid-run, the durable log — not the queue — is what lets it resume
> exactly once. Redis holds *work*; Postgres holds *truth*.
