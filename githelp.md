# githelp — Relay's Git/GitHub Operator Manual

This is the **mechanical companion** to [`docs/sprints/00-workflow.md`](docs/sprints/00-workflow.md).
The playbook says *what* each sprint does and teaches; this file gives the exact `git`/`gh` commands to
turn a sprint playbook into real GitHub history (branch, commits, draft PR, teaching comments, debate,
squash-merge, recap).

Every step is tagged:
- **[paste now]** — safe to run any time; deterministic.
- **[do live]** — depends on real state that only exists at run time (diff line numbers, commit SHAs,
  PR/issue numbers, a running app). Can't be pre-baked.

> ⚠️ **Repo isolation.** Your home folder `C:\Users\Owner` is itself a git repo pointed at
> `grouphelpdesk`. **Never run git from home or Desktop root.** Always operate inside this course
> folder (`relay/`), which has its own `.git`. Every command below assumes you are `cd`'d into it.

---

## 0. Prerequisites (one time, on your machine)

```bash
# GitHub CLI, if not already installed:
winget install --id GitHub.cli -e      # then reopen the terminal so `gh` is on PATH
gh auth login                          # GitHub.com → HTTPS → login with a web browser
gh auth status                         # confirm you're logged in as elirc
```

---

## 1. One-time repo setup  [paste now, after auth]

```bash
cd /c/Users/Owner/Desktop/gitvg/relay

# Create the isolated local repo (does NOT touch the home-dir repo)
git init -b main
git add -A
git commit -m "chore: Relay curriculum, playbooks, and repo scaffolding"

# Create the private GitHub repo from this folder and push
gh repo create relay --private --source=. --remote=origin --push

# Labels + 15 sprint milestones (+ enable Discussions)
bash scripts/setup-github.sh
```

**Branch protection (optional for a solo repo).** Full protection can get in your way when you're the
only author. A light touch — linear history, no force-push, run status checks — without requiring a
second reviewer:

```bash
gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": [] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

Then confirm the repo exists and looks right:

```bash
gh repo view --web        # opens github.com/elirc/relay
gh label list
gh api repos/{owner}/{repo}/milestones -q '.[].title'
```

---

## 2. Scaffolding reference

These files already exist in the repo (created alongside this one) and drive the workflow:

| File | Purpose |
|---|---|
| `.github/PULL_REQUEST_TEMPLATE.md` | Auto-fills every PR (Context/Approach/Tradeoffs/Deferred/Learning/**How to review**) |
| `.github/ISSUE_TEMPLATE/*.md` | User-story / task / bug forms + config |
| `.github/workflows/ci.yml` | pnpm+turbo CI; skips build jobs until code exists (main stays green) |
| `CONTRIBUTING.md` | Branch/commit/PR conventions (GitHub-facing) |
| `CODEOWNERS` | Swap `@elirc` for your handle |
| `docs/adr/0000-template.md` | ADR format (copy to `NNNN-title.md` per decision) |
| `scripts/setup-github.sh` | Labels + milestones + Discussions |
| `docs/LEARNER-GUIDE.md` | The junior's "how to study this repo" guide |

---

## 3. Per-sprint runbook (Phase A → G)

Replace `NN` and `<slug>` throughout (e.g. `01` / `foundation`). The *content* for each phase —
issue list, commit sequence, teaching-comment placements, the debate — comes from
`docs/sprints/sprint-NN.md`. This section is the command shell around it.

### Phase A — Setup  [paste now, content from playbook]
```bash
# Milestone already created by setup-github.sh. Create the sprint's issues:
gh issue create \
  --title "[S01] Walking skeleton: POST /hooks/demo → Run → one HTTP step → RunEvent log" \
  --body  "See docs/sprints/sprint-01.md. Acceptance: ..." \
  --label "sprint-01,phase-mvp" \
  --milestone "Sprint 01 — Foundation: hardcoded two-step relay"
# repeat per issue in the playbook's "Phase A — Issues" list
```

### Phase B — Build (the commit narrative)  [do live — real code]
```bash
git checkout main && git pull
git checkout -b sprint-NN/<slug>

# Implement the playbook's commit sequence in order. Each row of the playbook's
# "Phase B — Commits" table is one commit. Keep them small and readable.
git add <paths>
git commit -m "feat(api): scaffold fastify app with /health endpoint"
# ... continue through the whole sequence.
# [flaw] commits: commit the imperfection as-is (it's logged in flaw-ledger.md).
# [fix-later-in-PR] commits: commit broken → commit a failing test → commit the fix,
#   so the branch history shows the discovery→fix arc.
```

### Phase C — Open the draft PR  [do live — needs the branch pushed]
```bash
git push -u origin sprint-NN/<slug>

# Prepare the PR body from the template + the playbook's "Phase C" notes, then:
gh pr create --draft \
  --title "Sprint NN — <headline>" \
  --body-file .github/pr-body-sprint-NN.md \    # a filled copy of the template
  --milestone "Sprint NN — <title>" \
  --label "sprint-NN,phase-mvp"
# Grab the PR number for the next phases:
PR=$(gh pr view --json number -q .number)
```

### Phase D — Teaching comments  [do live — needs diff line anchors]
Inline review comments must anchor to a real file + line + commit SHA in the diff:
```bash
HEAD_SHA=$(git rev-parse HEAD)
gh api repos/{owner}/{repo}/pulls/$PR/comments \
  -f body="📘 concept: runs live in Postgres (truth), jobs live in Redis (work) — see ADR-0002." \
  -f commit_id="$HEAD_SHA" \
  -f path="apps/engine/src/worker.ts" \
  -F line=42 \
  -f side=RIGHT
# Repeat for each row in the playbook's "Phase D — Teaching comments" table.
# Prefixes: 📘 concept · 🔍 review-lens · ⚠️ pitfall · 🔗 connects
```
> Tip: the playbook tells you *which file/concept* each comment targets; you supply the real line
> number from the diff. `gh pr diff $PR` prints the diff so you can find anchors.

### Phase E — Planted debate  [do live]
Post the debate from the playbook's "Phase E" as a PR conversation comment (one comment carrying the
whole thread reads cleanly), then add the ADR:
```bash
gh pr comment $PR --body-file .github/debate-sprint-NN.md   # question + option A + option B + resolution
cp docs/adr/0000-template.md docs/adr/0001-<decision>.md    # fill it in, then commit on the branch
git add docs/adr/0001-<decision>.md && git commit -m "docs: ADR-0001 <decision>"
git push
```

### Phase F — Finalize & merge  [do live]
```bash
# Curriculum note for the sprint:
#   docs/curriculum/sprint-NN.md  (objectives, key concepts, 3–5 exercise questions, further reading)
git add docs/curriculum/sprint-NN.md && git commit -m "docs: curriculum note sprint NN" && git push

gh pr ready $PR                      # flip out of draft
# ensure CI is green and threads resolved, then squash-merge with a curated message:
gh pr merge $PR --squash \
  --subject "feat(sprint-NN): <headline>" \
  --body "$(printf 'Bullet summary of what shipped.\n\nCloses #<i1>\nCloses #<i2>')"
```

### Phase G — Post-merge  [do live]
```bash
git checkout main && git pull

# Tag at phase boundaries:
git tag -a v0.5.0 -m "Relay MVP complete (Sprints 1–5)" && git push origin v0.5.0   # after S05
# git tag -a v1.0.0 -m "Relay v1.0" && git push origin v1.0.0                        # after S15

# File any deferred work as issues (from the playbook's "Deferred" list), labeled `deferred`.
# Close the sprint milestone:
gh api -X PATCH repos/{owner}/{repo}/milestones/<milestone_number> -f state=closed

# Sprint Recap: post the playbook's "Recap one big idea" in the Discussions tab
# (Discussions creation is GraphQL-only via CLI; easiest to paste it in the web UI:
gh repo view --web
```

---

## 4. Must be done live (cannot be pre-generated)

- The **actual source code** for each commit (the playbook describes it; you/the AI write it).
- **Inline teaching comments** — need real diff line numbers + the head commit SHA.
- **Issue / PR numbers and commit SHAs** for cross-linking.
- **Screenshots / recordings**, CI going **green**, **deploy** URLs (Sprint 05+).
- **Measured numbers** — Lighthouse, k6, the latency budget, convergence-fuzzer runs.
- **Branch protection** — applied against the live repo (§1).

---

## 5. Quick reference

**Conventional commit types:** `feat` `fix` `refactor` `test` `docs` `chore` `perf` `ci`
**Teaching-comment prefixes:** `📘 concept` · `🔍 review-lens` · `⚠️ pitfall` · `🔗 connects`
**Branches:** `sprint-NN/<slug>` · labs `lab/sprint-NN` · merges are **squash-only**, `main` linear
**Co-authorship tags (in commit subjects, later courses):** `[L]` learner-authored · `[A]` AI reference
**Labels:** `sprint-01…15` · `phase-mvp`/`phase-full` · `teaching:*` · `planted-debate` · `deferred` · `lab` · `adr` · `good-first-read`

Handy commands:
```bash
gh pr diff $PR            # view the diff to find comment anchors
gh pr view $PR --web      # open the PR in the browser
gh pr checks $PR          # CI status
gh issue list --milestone "Sprint 01 — ..."   # sprint's issues
```

---

## 6. Driving a sprint with an AI agent later

When you're ready to build Sprint NN, point the agent at **`docs/sprints/sprint-NN.md`** (the content)
and **this file** (the mechanics). The division of labor:
- The agent writes the real code (Phase B), the PR body, the teaching-comment text, the debate text,
  and the curriculum note.
- The `git`/`gh` commands here execute it. The agent can run them once `gh` is authed — the only
  human-in-the-loop step is the interactive `gh auth login`.

A good prompt: *"Build Relay Sprint 03 following docs/sprints/sprint-03.md and githelp.md §3. Create
the issues, the branch, the commit sequence with real code, open the draft PR, place the teaching
comments on the actual diff lines, post the debate, then stop before merging so I can review."*
