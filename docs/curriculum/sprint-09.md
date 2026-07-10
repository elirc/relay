# Curriculum Note — Sprint 9: Code Steps — the Sandbox

## Learning objectives
- Run **actively hostile** code without letting it own the engine — the threat model *is* the curriculum.
- Internalize **allowlist, not denylist**, and **subtraction, not addition**.
- Enforce limits from **outside** the guest; you can't trust in-sandbox time or memory.
- Recognize and block **SSRF** — user code + fetch is a request-forgery engine by default.

## Key concepts
- **Sandboxing is subtraction.** The execution context starts EMPTY; we grant only `input` and `console`.
  There is no `require`, `process`, `fetch`, `Buffer`, or timers to reach. You **can't enumerate every
  escape**, so a denylist always loses — you expose a tiny surface and add to it deliberately. This is
  the S04 expression-language philosophy with the stakes raised from "corrupt a field" to "own the host."
- **Limits live outside the guest.** A wall-clock deadline kills a runaway step, enforced by the host —
  because a guest `setTimeout` isn't a limit (the guest controls it). CPU-via-wall-clock and an
  isolate-level memory cap are the real bounds; a breach becomes a typed `SandboxError`, never a raw host
  error leaking server paths.
- **The escape suite is the real spec of "sandboxed."** `constructor.constructor` and prototype pollution
  are escapes most juniors have never heard of. Each adversarial test is a mini-lecture, and the suite is
  what a security review re-runs after any surface change. Read `runner.test.ts` and `ssrf.test.ts` as
  the definition of the word.
- **SSRF: the metadata endpoint is the crown jewel.** `http://169.254.169.254/` returns cloud
  credentials on AWS/GCP — user code that can reach it can impersonate your server. So egress is
  allowlist-only (per-org, by host) AND blocklist-checked (loopback/private/link-local/metadata), with a
  resolved-IP re-check to defeat DNS rebinding. Belt and suspenders: even an allowlisted host is refused
  if it resolves internal.
- **Isolation is a spectrum priced in ops complexity.** `node:vm` (a teaching stand-in) < `worker_threads`
  < `isolated-vm` (our production choice) < microVMs (Firecracker/gVisor). ADR-0011 states exactly what
  each contains and names the trigger to escalate. *Buy the tier your threat model needs, not the
  scariest one.*
- **Honesty about the boundary.** This PR uses `node:vm`, which is NOT a security boundary by itself. The
  ADR says so plainly, and the *architecture* around the isolate — surface, deadline, taxonomy, egress —
  is what's real and portable. Swap the isolate; keep everything else. Pretending a weak boundary is
  strong is the actual danger.

## Planted debt (find it)
- **Flaw #5:** console-log capture is **unbounded**. A tight `console.log()` loop can OOM the worker
  capturing output faster than the deadline fires. Harvested S13 (the poison-pill lab). It's on the
  security checklist as an open item — the hint that it was noticed but not yet fixed.

## Lab (`lab/sprint-09`, break-it) — you are the attacker
Given the sandbox, attempt escapes and resource exhaustion. Document what the limits caught — and
(foreshadowing #5) what the console capture did *not*.

## Exercise questions
1. Why is a denylist ("block `require`, `process`, …") guaranteed to lose against arbitrary user JS?
   Give an escape a denylist author would forget.
2. Why must the deadline live outside the isolate? Show why a guest `setTimeout` can't self-limit.
3. Walk an SSRF attack that steals cloud credentials. Which two defenses (blocklist, allowlist,
   resolved-IP check) stop it, and which single one is insufficient alone?
4. `node:vm` vs `isolated-vm` vs microVM: for each, name a threat it contains and one it doesn't.

## Further reading
- STRIDE threat modeling · SSRF & cloud metadata (capital-one breach) · V8 isolates / isolated-vm ·
  Firecracker/gVisor · DNS rebinding · Capability-based security (grant, don't forbid)
