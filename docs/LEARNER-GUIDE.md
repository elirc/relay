# Learner Guide — How to Study Relay

Welcome. **Relay is a course disguised as a codebase.** It's a from-scratch build of a Zapier-class
workflow-automation platform (triggers, actions, multi-step "relays", a connector ecosystem, a durable
execution engine), delivered as 15 pull requests. You are not here to write the code — the PRs are
already authored, heavily annotated, and merged. You are here to **read them the way a senior engineer
reads a teammate's work**, and to graduate from "can make it work" to "can make it good."

This is Course 4 of a larger curriculum. Its signature subjects are the hard problems of *backend
orchestration*:

- **Durable execution** — multi-step runs that checkpoint, resume, and replay across process death.
- **Idempotency against systems you don't control** — Relay's steps call *someone else's* API to send a
  real email. A retry that double-sends is a bug your users feel. Here idempotency stops being hygiene
  and becomes existential.
- **Running untrusted user code safely** — sandboxed JS "code steps" with resource limits and no
  ambient I/O (the Sprint 9 centerpiece).
- **Connector adapter farms** — a declarative SDK that makes the 10th integration 10× cheaper than the 1st.

**The central arc:** Sprints 1–5 build a *naive* engine — a run executes steps with no retries, no
checkpoints, no idempotency. Then **Sprint 7 rebuilds it as a durable engine** (checkpoint/resume/replay)
under a live product. You watch a senior team re-derive, by hand, every problem a framework like
Temporal exists to solve — so you can adopt such tools later *knowingly* rather than superstitiously.

**The co-star:** a **mock vendor farm** (three fake SaaS apps — MailPost, SheetLite, ChatBox — with
OAuth2, REST, webhooks, HMAC, and configurable failure injection) is built in Sprint 2 and abused for
the next 13 sprints. Its chaos knobs (latency, 429s, 5xx, malformed payloads) are on in *every*
integration test, not just the hardening sprint.

---

## The one rule that makes this work

**Observation is the weakest form of learning.** Reading a beautiful PR feels productive and teaches
almost nothing if you stay passive. So for every sprint, do these three active moves:

1. **Predict before reading.** Open the sprint's issues (the GitHub milestone) and the top of
   `docs/sprints/sprint-NN.md`. Before looking at the diff, write half a page: what schema, what
   steps, what the tricky part will be, what bug you'd expect. *Then* read the PR. The gap between your
   plan and the senior's is where the learning actually lives.
2. **Review before the reveal.** Read the diff and leave your *own* review comments (mentally or in a
   scratch file) — what would you flag? *Then* read the placed teaching comments and compare. This
   trains the reviewer's eye, which is the mid-to-senior skill.
3. **Do the lab.** Labs land after **S4, S7, S9, S11, and S13**. A `lab/sprint-NN` branch injects bugs
   drawn from that sprint's own failure classes (a non-idempotent retry, a sandbox escape, an unfair
   queue). Find them using the sprint's own tooling — the vendor farm's chaos knobs, the replay UI, the
   run event log — not by eyeballing. This is where knowledge becomes skill.

---

## How to read a single PR

Every PR has a **"How to review this PR"** section that gives you a file reading order. Follow it — it's
not the order the files appear in the diff, it's the order that tells the story (usually: schema →
engine/api → connectors/web → tests → docs). Watch for:

- **Teaching comments**, tagged by intent:
  - `📘 concept` — a pattern or principle
  - `🔍 review-lens` — what a senior checks right here
  - `⚠️ pitfall` — the bug class this code avoids
  - `🔗 connects` — a link to an ADR, an earlier sprint, or a future one (or a prior course)
- **The commit sequence.** Read commits in order — several sprints deliberately commit a naive version,
  then a failing test that exposes its worst omission, then the fix. That red→green arc *is* the lesson.
- **The planted debate.** Each PR has a design-decision thread with both sides argued and a resolution
  (e.g. "hand-rolled engine vs. Temporal" in S1). Read the losing side charitably; if you can't explain
  why it lost, you haven't learned the decision.
- **The ADRs** in `docs/adr/` — the durable "why" behind the architecture.

---

## The idempotency rule (the course's spine)

From Sprint 2 on, **any step that calls a vendor must declare its idempotency strategy** — a natural
key, a vendor idempotency header, or best-effort-with-a-dedup-window — right in the connector
definition, reviewed like a type signature. As you read each connector, ask: *if the engine crashed
after this side effect but before recording success, what happens on retry?* If you can't answer, you've
found the bug the sprint is about to teach.

---

## The flaw ledger (don't peek too early)

`docs/sprints/flaw-ledger.md` lists imperfections planted on purpose in early sprints and harvested
later (a non-idempotent action, a naive polling cursor that drops events, an unbounded payload). **Try
to spot the flaws yourself as you read** before you consult the ledger — that's the exercise.
Discovering a planted flaw in Sprint 3 that bites in Sprint 11 is the whole point.

---

## Pace and cadence

- **One sprint per 1–2 weeks.** Bingeing all 15 in a weekend produces recognition, not skill.
- After each sprint, write a short **teach-back**: explain the sprint's one big idea and the ADR's
  losing side in your own words. If you can't, re-read.
- Track yourself against the competency additions in `SPEC.md` §4 — score yourself before Sprint 1 and
  again after Sprint 15. The delta is the point.

---

## Your role rises over the course

- **Sprints 1–7:** observer / predictor / reviewer.
- **Sprint 8 (dialogue format):** you co-author the "junior" implementation of a branching step; the
  AI's review of your code is the teaching artifact.
- **Sprint 14 (the practical exam):** you **ship a connector solo** against the certification harness —
  the course's capstone skill. If your connector passes the harness (schemas, auth, idempotency, chaos),
  you've internalized the SDK.

Observer → author → peer is the whole arc of the curriculum.

---

## Where things live

- `SPEC.md` — the product spec, tech stack, domain model, and competency additions
- `docs/sprints/README.md` — the sprint index and the cross-sprint arcs to watch
- `docs/sprints/00-workflow.md` — the ritual every sprint follows
- `docs/sprints/sprint-NN.md` — the playbook for each sprint (what the PR does and teaches)
- `docs/adr/` — architecture decision records
- `docs/curriculum/sprint-NN.md` — per-sprint learning objectives + exercise questions (added as each
  sprint merges)

Start at `docs/sprints/README.md`, then read the Sprint 01 PR. Predict first.
