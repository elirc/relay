# Changelog

All notable changes to Relay. Grouped by sprint (each sprint was one squash-merged PR).

## [1.0.0] — 2026-07-09

An offline-capable, durable, multi-tenant workflow-automation platform, built across 15 sprints as a
teaching curriculum. See [docs/COURSE-RETROSPECTIVE.md](docs/COURSE-RETROSPECTIVE.md).

### Sprint 15 — Production readiness
- **obs:** run-lifecycle tracing (vendor spans carry rate-governor wait), engine metrics with per-connector
  + error-class failure breakdown, stuck-run detection + per-connector **circuit breaker** (ADR-0016).
- **ops:** safe bulk DLQ replay (S07 idempotency), graceful drain, backup/restore + KEK runbook, the
  vendor-hang incident drill + blameless postmortem, runbooks.
- **docs:** course retrospective, README refresh.

### Sprint 14 — Connector certification
- Connector semver + deprecation; the certification harness (safety floor + quality tier); our 3
  connectors dogfooded; **CalendarLite** authored + certified (the practical exam). ADR-0015.

### Sprint 13 — Hardening (flaws #1, #4, #5 closed)
- Single-pass expr render + fuzz corpus; sandbox output caps; webhook HMAC + timestamp + replay; KEK
  rotation drill; SSRF DNS-rebinding guard; threat-model synthesis.

### Sprint 12 — Run debugging & metering
- Expression resolution trace; idempotent task metering (`@@unique(run,step)`); alert storm suppression;
  relay health. ADR-0014.

### Sprint 11 — Rate limits & fairness (flaw #3 closed)
- Shared token-bucket governor; weighted fair queuing + priority lanes; shared trigger subscriptions
  keyed by resource. ADR-0013.

### Sprint 10 — Data mapping v2 (flaw #2 closed)
- Fan-out with per-item checkpoints; payload offloading to object storage; array ops with cost bounds.
  ADR-0012.

### Sprint 09 — Code steps: the sandbox
- Controlled-surface runner, outside-the-guest limits, SSRF defenses + proxied fetch. ADR-0011.

### Sprint 08 — Branching & the DAG
- Kahn topological execution, DAG validation (2 layers), structured conditions, filter nodes. ADR-0010.

### Sprint 07 — Durable runs (flagship)
- Checkpoints, idempotency keys honored by the farm, replay, graceful shutdown — the S05 duplicate-email
  arc closed. ADR-0009.

### Sprint 06 — Triggers at scale (flaws #3, #4 planted)
- Polling/webhooks/schedules, dedupe discipline, ChatBox connector. ADR-0008.

### Sprint 05 — Engine v1 → v0.5.0
- Queued execution, retry policy by error class, run history, the duplicate-email arc (flaw #2 planted).
  ADR-0007.

### Sprint 04 — Builder + safe expressions (flaw #1 planted)
- No-eval `{{path}}` language, immutable versioned definitions, schema-generated builder. ADR-0006.

### Sprint 03 — Connector SDK
- Declarative connectors, mandatory idempotency, closed error taxonomy, registry. ADR-0005.

### Sprint 02 — Connections & the vendor farm
- Three mock vendors (OAuth2, chaos), envelope-encrypted tokens, single-flight refresh. ADR-0003/0004.

### Sprint 01 — Foundation
- Monorepo (web/api/engine), the hardcoded walking skeleton, append-only run event log. ADR-0001/0002.

[1.0.0]: https://github.com/elirc/relay/releases/tag/v1.0.0
