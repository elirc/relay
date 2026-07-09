# Contributing to Relay

Relay is a **teaching repository**. The AI authors every PR, commit, teaching comment, and design
debate; the learner studies each merged PR. This file is the GitHub-facing summary of the conventions.
The full pedagogical ritual lives in [`docs/sprints/00-workflow.md`](docs/sprints/00-workflow.md); the
mechanical git/`gh` commands live in [`githelp.md`](githelp.md).

## The unit of work is a sprint = a PR

Each of the 15 sprints (see [`docs/sprints/`](docs/sprints/)) ships as **one Pull Request** from a
feature branch, squash-merged into a linear `main`.

## Branches
- `sprint-NN/<slug>` — e.g. `sprint-03/issues-classic`
- `lab/sprint-NN` — post-sprint practice branches with injected bugs for the learner

## Commits (Conventional Commits)
`feat:` `fix:` `refactor:` `test:` `docs:` `chore:` `perf:` `ci:`

- Imperative mood; the body explains **why**, not what.
- The commit *sequence* within a branch is pedagogical — it tells the story of how the feature was
  built (schema → server → client → tests → polish → docs).
- Some commits are tagged in the playbook: **`[flaw]`** (a deliberate imperfection, logged in
  `docs/sprints/flaw-ledger.md`, harvested in a later sprint) and **`[fix-later-in-PR]`** (broken →
  failing test → fix, visible as a story in the branch history). Never fix a planted flaw silently.
- Some commits carry **`[L]`** (learner-authored, AI-reviewed) / **`[A]`** (AI reference) tags in
  later courses.

## Pull requests
- Use the PR template. The **"How to review this PR"** section (file reading order) is mandatory.
- 10–25 inline **teaching comments** using the prefix taxonomy:
  `📘 concept` · `🔍 review-lens` · `⚠️ pitfall` · `🔗 connects`
- At least one **planted design debate** thread (both sides argued + a resolution), often producing
  an ADR in [`docs/adr/`](docs/adr/).
- **Squash-merge only.** `main` stays linear and always green.
- **Never** merge red CI, force-push after teaching comments are placed (it breaks comment anchors),
  or leave a TODO without a linked issue.

## Definition of Done
See the checklist at the bottom of the PR template.

## Labels & milestones
Created by [`scripts/setup-github.sh`](scripts/setup-github.sh). One milestone per sprint; labels for
sprint number, phase, teaching topic, and process (`planted-debate`, `deferred`, `lab`, `adr`).
