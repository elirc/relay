# ADR-0006: A hand-rolled, closed expression language (no eval, ever)

- **Status:** Accepted
- **Date:** 2026-07-09
- **Sprint:** S04
- **Deciders:** Relay authors

## Context
Field mapping needs a way to write `{{steps.1.output.email}}` into an action's inputs. This string
language is, by usage, **the product's most-attacked API**: users constantly paste untrusted
data (webhook payloads, vendor responses) through templates. Whatever we build here, an attacker will
feed it hostile input a million times a day.

## Decision
A **hand-rolled, closed grammar**: a template is literal text interleaved with `{{ dotted.path }}`
references, and nothing else. No operators, no function calls, no arithmetic, no filters. The v1
implementation is a tokenizer + a path resolver over a fixed scope (`trigger`, `steps`). Two rules:
- **`{{x}}` alone preserves the value's type** (a number stays a number, an array stays an array); any
  surrounding text coerces to a string.
- **A missing path is a render-time error**, not a silent empty string.

`eval`/`new Function` are **banned** (a lint rule enforces it from this sprint).

## Alternatives considered
- **`new Function` / eval-based templating** (or a full expression library with JS semantics). Instantly
  gives users arithmetic, conditionals, function calls — and a remote-code-execution surface. This is
  the shape of real CVEs (template engines that allowed `constructor.constructor`). One `eval` in a
  string that untrusted data flows through is a breach; there is no safe way to sandbox it that's
  simpler than not doing it.
- **A big expression language up front** (operators, filters, conditionals). Every feature is a new
  chunk of attack surface and parser complexity. We start with the smallest thing that maps fields, and
  each operator added later (S10) is a *separate, deliberate security decision* — not a default we have
  to walk back under pressure.

## Consequences
- The entire injection surface is a **path resolver over a fixed scope**. There is no code path that
  executes user-authored logic. That's the point.
- Type preservation is product quality: platforms that coerce everything to strings silently flatten
  `5`→`"5"` and arrays→`"[object Object]"`, corrupting data one step downstream.
- **Known limitation (revisit S10):** no transforms yet (uppercasing, defaults, formatting). When we add
  them, they arrive as a closed set of named helpers, reviewed one at a time — never as `eval`.
- ⚠️ A rendering subtlety around resolved values that themselves contain `{{…}}` is exactly the kind of
  edge the S13 fuzzer exists to find. Smallness limits the blast radius even of our own mistakes.

## Links
- `packages/expr/`, `apps/api/src/lib/relay-plan.ts`, `docs/sprints/sprint-04.md`
