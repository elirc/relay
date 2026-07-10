# ADR-0011: Sandbox threat model & defense layers for code steps

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S09
- **Deciders:** Relay authors

## Context
Code steps let builders run arbitrary JavaScript inside our engine. The threat model is stark: the code
is **actively hostile** and multi-tenant. It will try to read other orgs' data, steal cloud credentials
(the 169.254.169.254 metadata endpoint), exhaust CPU/memory to take down the worker, and escape the
runtime. "It's just a script" is exactly the wrong instinct.

## Decision
Defense in layers, and the guiding stance: **sandboxing is subtraction, not addition — start from
nothing and grant, never start from everything and forbid.**

1. **Controlled surface (allowlist, not denylist).** The execution context starts EMPTY; we grant only
   `input` and `console`. No `require`, `process`, `fetch`, `globalThis` escape, `Buffer`, or timers.
   You cannot enumerate every escape, so you expose a tiny surface and add to it deliberately (the S04
   expression-language philosophy, stakes raised).
2. **Resource limits enforced from OUTSIDE the guest.** A wall-clock deadline kills a runaway step; you
   cannot trust in-sandbox time (a guest `setTimeout` is not a limit). Memory is capped at the isolate
   level. A breach → a typed `SandboxError`, never a raw host error with server paths.
3. **Egress through one door, gated.** The only network access is a proxied fetch behind an SSRF
   blocklist (loopback/private/link-local/metadata) AND a per-org host allowlist, resolved-IP-checked
   (DNS-rebinding defense). Everything funnels through one chokepoint so policy and observability live in
   one place.

## The isolation spectrum (the debate)
Isolation is a spectrum priced in operational complexity; buy the tier your threat model needs, not the
scariest one.
- **`node:vm` (what this PR uses as a teaching stand-in):** NOT a security boundary alone — a determined
  attacker escapes via `this.constructor.constructor`. It faithfully carries the *architecture* (surface,
  deadline, taxonomy, egress) so the isolate is swappable.
- **`worker_threads`:** a weaker boundary than a real isolate — separate thread, but shared process; the
  ADR states plainly it contains resource abuse better than it contains a determined escape.
- **`isolated-vm`:** a real, separate V8 isolate in-process. Strong with limits + no ambient I/O. **Our
  production choice.** (Native build; fallback to worker_threads where it won't build.)
- **microVMs (Firecracker/gVisor):** strongest, ops-heavy. **Trigger to adopt:** running native code, or
  a paid tier promising hard multi-tenancy guarantees.
- **WASM:** promising, but the JS-in-WASM host-call surface is immature for arbitrary user JS today.

## Consequences
- The escape/limit/SSRF **test suites are the real spec of "sandboxed"** — each adversarial case is a
  documented mini-lecture, and the suite is what a security review re-runs after any surface change.
- **Known gap (flaw #5, ledger):** console-log capture is currently **unbounded** — a `while(true)
  console.log()` can OOM the worker capturing output faster than the deadline fires. Harvested S13 (the
  poison-pill lab). Output caps are on the security checklist.
- Any change that grants a new global or egress path requires the security checklist + a new escape test.

## Links
- `apps/engine/src/sandbox/{runner,ssrf,proxy,errors}.ts` (+ tests), `docs/sandbox-security-checklist.md`,
  ADR-0006 (expression language, same allowlist philosophy), `docs/sprints/sprint-09.md`
