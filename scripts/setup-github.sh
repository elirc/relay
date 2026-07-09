#!/usr/bin/env bash
# Relay — one-time GitHub setup: labels + milestones (+ enable Discussions).
# Prereqs: `gh auth login` done, and you are inside the relay repo with an `origin` remote.
# Usage:   bash scripts/setup-github.sh
# Safe to re-run: labels use --force; milestone creation tolerates duplicates.

set -uo pipefail

echo "==> Repo: $(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo '??? (run inside the repo, after gh auth login)')"

label() { gh label create "$1" --color "$2" --description "$3" --force >/dev/null 2>&1 && echo "  label: $1"; }

echo "==> Creating labels"
# Sprints
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15; do
  label "sprint-$n" "ededed" "Sprint $n"
done
# Phase
label "phase-mvp"  "0e8a16" "Phase 1 — MVP (S01–S05)"
label "phase-full" "1d76db" "Phase 2 — full product (S06–S15)"
# Teaching topics (Relay-specific)
label "teaching:orchestration" "5319e7" "DAG / workflow orchestration"
label "teaching:durability"    "5319e7" "Durable execution: checkpoint/resume/replay"
label "teaching:idempotency"   "5319e7" "Retries & idempotent external side effects"
label "teaching:connectors"    "1d76db" "Connector SDK, registries, adapters"
label "teaching:sandbox"       "b60205" "Running untrusted user code safely"
label "teaching:secrets"       "b60205" "Envelope encryption, secret hygiene"
label "teaching:performance"   "fbca04" "Fairness, rate limits, load, metering"
label "teaching:security"      "b60205" "Chaos, poison pills, replay defense"
label "teaching:testing"       "0e8a16" "Test strategy / failure injection"
# Process
label "planted-debate"  "d93f0b" "A deliberate design debate thread lives on this PR"
label "deferred"        "c5def5" "Deferred work, filed as a linked issue"
label "lab"             "fef2c0" "Post-sprint practice branch/exercise"
label "adr"             "bfd4f2" "Introduces or changes an ADR"
label "good-first-read" "7057ff" "A good PR for the learner to study first"

echo "==> Creating milestones (one per sprint)"
milestone() {
  gh api "repos/{owner}/{repo}/milestones" -f title="$1" -f state=open >/dev/null 2>&1 \
    && echo "  milestone: $1" || echo "  milestone exists/skip: $1"
}
milestone "Sprint 01 — Foundation: hardcoded two-step relay"
milestone "Sprint 02 — Orgs, connections & the vendor farm"
milestone "Sprint 03 — Connector SDK v1 + first two connectors"
milestone "Sprint 04 — Builder v1: linear relays + expressions"
milestone "Sprint 05 — Engine v1 + run history (v0.5.0)"
milestone "Sprint 06 — Triggers at scale: polling, webhooks, schedules"
milestone "Sprint 07 — Engine v2: durable runs (flagship)"
milestone "Sprint 08 — Branching & the DAG"
milestone "Sprint 09 — Code steps: the sandbox"
milestone "Sprint 10 — Data mapping v2: arrays, loops, large payloads"
milestone "Sprint 11 — Rate limits & fairness"
milestone "Sprint 12 — Run debugging & metering"
milestone "Sprint 13 — Hardening: chaos, poison pills & secrets audit"
milestone "Sprint 14 — Connector farm at scale + learner certification"
milestone "Sprint 15 — Production readiness (v1.0.0)"

echo "==> Enabling Discussions (for Sprint Recap posts)"
gh api -X PATCH "repos/{owner}/{repo}" -F has_discussions=true >/dev/null 2>&1 \
  && echo "  discussions: on" || echo "  discussions: could not toggle (enable in Settings if needed)"

echo "==> Done. Next: open Sprint 01 (see githelp.md §3)."
