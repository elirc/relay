# Relay Sprint Playbooks

Execution scripts for the 15-sprint build of **Relay** (workflow automation — see [SPEC.md](../../SPEC.md)). Course 4; assumes Meridian, Tracer, Pulse.

**Start here:** [00-workflow.md](00-workflow.md) — the ritual plus Relay rules (idempotency declarations, chaos-always-on, no-eval, labs).

| Sprint | Playbook | Headline |
|--------|----------|----------|
| 01 | [sprint-01.md](sprint-01.md) | Foundation: hardcoded webhook→action relay |
| 02 | [sprint-02.md](sprint-02.md) | Connections, OAuth client, the vendor farm |
| 03 | [sprint-03.md](sprint-03.md) | Connector SDK v1 + registry |
| 04 | [sprint-04.md](sprint-04.md) | Builder v1: linear relays, safe expressions |
| 05 | [sprint-05.md](sprint-05.md) | Engine v1, run history, deploy → `v0.5.0` |
| 06 | [sprint-06.md](sprint-06.md) | Triggers at scale: polling, webhooks, schedules |
| 07 | [sprint-07.md](sprint-07.md) | Engine v2: durable runs (flagship) |
| 08 | [sprint-08.md](sprint-08.md) | Branching & the DAG (dialogue format) |
| 09 | [sprint-09.md](sprint-09.md) | Code steps: the sandbox |
| 10 | [sprint-10.md](sprint-10.md) | Data mapping v2: loops & large payloads |
| 11 | [sprint-11.md](sprint-11.md) | Rate limits & fairness |
| 12 | [sprint-12.md](sprint-12.md) | Run debugging & metering |
| 13 | [sprint-13.md](sprint-13.md) | Hardening: chaos, poison pills, secrets |
| 14 | [sprint-14.md](sprint-14.md) | Connector farm + learner certification |
| 15 | [sprint-15.md](sprint-15.md) | Production readiness → `v1.0.0` |

**Arcs to watch:** the duplicate-email incident (S5's in-PR arc becomes S7's flagship problem); the expression language's injection flaw aging from S4 to S13; the vendor farm's failure knobs turning up sprint by sprint. Ledger: [flaw-ledger.md](flaw-ledger.md).
