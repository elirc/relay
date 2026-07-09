# Sprint 09 — Code Steps: The Sandbox

**Branch:** `sprint-09/sandbox` · **Size:** L · Ritual: [00-workflow.md](00-workflow.md)

**Goal:** The untrusted-code sprint. Let builders write JavaScript steps — and run them without letting them own the engine. isolated-vm, memory/CPU/time limits, no ambient I/O, network only through a proxied allowlist, output caps. The threat model *is* the curriculum.

## A — Issues
1. `CodeStep model: user JS, versioned, per-step`
2. `Sandbox runtime: isolated-vm (fallback worker_threads), memory + CPU-time + wall-time limits`
3. `Controlled surface: input injection, return-value extraction, no require/fetch/process`
4. `Proxied fetch: opt-in, allowlisted hosts, counts against limits`

## B — Commits
| # | Commit | Notes |
|---|--------|------|
| 1 | `feat(db): CodeStep — source, version; runs pinned like relay versions (S4)` | |
| 2 | `feat(engine): isolated-vm runner — fresh isolate per execution, injected input, extracted output` | no ambient globals: no `process`, `require`, `fetch`, `globalThis` escapes; the allowlist-not-denylist stance |
| 3 | `feat(engine): resource limits — memory cap (isolate), CPU via wall-clock deadline, hard kill on breach` | breach → StepRun FAILED with a clear error class (`SandboxLimitExceeded`) |
| 4 | `feat(engine): console capture for debugging — [unbounded]` | **[flaw #5]** a `while(true) console.log()` OOMs the worker capturing output (harvest S13 — it's the poison-pill lab) |
| 5 | `feat(engine): proxied fetch — opt-in, host allowlist per org, timeouts, counts toward step budget` | the only I/O door; goes through the S3 http helper so limits/observability apply; SSRF defenses (no internal IPs, no metadata endpoints) |
| 6 | `test(security): escape attempts — prototype pollution, constructor.constructor, timing, infinite loop, memory bomb, require() ` | the adversarial suite; each attempt documented with why it fails |
| 7 | `feat(web): code editor — monaco, input schema hints, test-run with sample data + captured logs` | |
| 8 | `test(engine): resource limits enforced — memory bomb killed <Xms, CPU deadline honored` | |
| 9 | `docs: ADR-0011 sandbox threat model + defense layers; curriculum note` | STRIDE on the sandbox; the layers diagram |
| 10 | `docs: sandbox security review checklist (for future code-surface changes)` | |

## C — Review order
Threat model ADR (9) first → the runner's controlled surface (2) → limits (3) → escape suite (6) → proxied fetch SSRF defenses (5).

## D — Teaching comments (~11)
- isolate per execution — 📘 no shared state = no cross-tenant leakage through the runtime; the cost (isolate startup) and the mitigation (pooling, carefully)
- allowlist stance — 📘 denylists lose (you can't enumerate every escape); expose a tiny surface and add to it deliberately — same philosophy as the expression language (S4), stakes raised
- CPU via wall-clock — ⚠️ you can't trust in-sandbox time; the deadline lives *outside* the isolate and kills it; why `setTimeout` inside is not a limit
- escape suite — 🔍 review-lens: `constructor.constructor` and prototype pollution are the escapes juniors have never heard of; each test is a mini-lecture; the suite is the real spec of "sandboxed"
- SSRF via proxied fetch — ⚠️ user code + fetch = a request forgery engine unless internal ranges/metadata endpoints are blocked; the allowlist is per-org and *hosts*, resolved-IP-checked (DNS rebinding defense)
- output caps missing — *(silent — flaw #5; the S13 poison-pill lab will make the learner feel it)*
- worker_threads fallback — 📘 defense-in-depth honesty: worker_threads is a weaker boundary than isolated-vm; the ADR states exactly what each does and doesn't contain

## E — Debate
**"isolated-vm vs a remote execution service (Firecracker/gVisor microVMs) vs WASM?"** microVMs: strongest isolation, ops-heavy. WASM: promising, but the JS-in-WASM story and host-call surface are immature for arbitrary user JS. isolated-vm: strong in-process V8 isolate, good enough with limits + no ambient I/O. **Resolution:** isolated-vm with the ADR naming the trigger for microVMs (running native code, or a paid tier promising hard multi-tenancy guarantees). Lesson: *isolation is a spectrum priced in operational complexity; buy the tier your threat model needs, not the scariest one.*

## F/G — Close
- Squash: `feat(sprint-09): sandboxed code steps (closes #…)`
- **Lab (break-it):** the learner *is* the attacker — given the sandbox, attempt escapes and resource exhaustion; document what the limits caught and (foreshadowing #5) what the console capture did *not*.
- Ledger: flaw #5 recorded.
- Recap idea: *sandboxing is subtraction, not addition — start from nothing and grant, never start from everything and forbid.*
