# Sandbox Security Review Checklist

Run this before ANY change to the code-step surface (a new global, a new egress path, a new host
function). The sandbox is the one place where hostile input runs as code; treat every addition as a
potential escape until proven otherwise. Pair each new surface with a new adversarial test.

## Controlled surface
- [ ] The new global/function is the **smallest** thing that satisfies the need (allowlist, not denylist).
- [ ] It exposes **no path to** `require`, `process`, `module`, `globalThis` (host), `Buffer`, or the
      constructor chain (`constructor.constructor` → `Function`).
- [ ] It cannot return a **live host object** the guest can pull capabilities off of (pass plain data,
      not references to host functions/objects).

## Resource limits
- [ ] Any new operation is bounded — no unbounded loops, buffers, or recursion reachable from it.
- [ ] Limits are enforced **outside the guest** (the guest cannot disable or extend its own deadline).
- [ ] **Output/log capture is capped** (open item — flaw #5: console capture is currently unbounded).

## Egress (network)
- [ ] All network goes through the proxied fetch — no direct `fetch`/socket handed to the guest.
- [ ] SSRF blocklist covers loopback, private ranges, link-local, and cloud metadata (169.254.169.254).
- [ ] Allowlist is **per-org and by host**, and the target is **resolved-IP-checked** at connect time
      (DNS-rebinding defense).
- [ ] Only `http`/`https` schemes; redirects are re-validated against the same policy.

## Errors & observability
- [ ] Failures surface as a typed `SandboxError` — never a raw host error with server paths/stack.
- [ ] Egress and resource usage are counted against the step budget and logged.

## Isolation tier
- [ ] The change doesn't assume `node:vm`-level containment for anything security-critical; production is
      isolated-vm (see ADR-0011). If it does, escalate the isolation tier.
