# Curriculum Note — Sprint 4: Builder v1 + safe expressions

## Learning objectives
- Design a **safe-by-construction** template language and understand why smallness is the security win.
- Make **immutable, versioned definitions** the foundation that later replay (S07) depends on.
- Reap the payoff of S3's schemas: **UI forms generated from data**, not hand-written per connector.
- Enforce a graph invariant (**upstream-only references**) in two layers.

## Key concepts
- **The safest language is the one that can't do anything.** The expression grammar is paths-only:
  `{{steps.1.output.email}}`, no operators, no functions, no `eval`. Because it's the product's
  most-attacked API, the entire injection surface is reduced to a *path resolver over a fixed scope*.
  Every operator we might add later (S10) becomes a separate, deliberate security decision — not a
  default to walk back. (ADR-0006 sketches the `new Function` alternative and its CVE-shaped history.)
- **Type preservation is product quality.** `{{trigger.count}}` returns the number `5`; `"Count:
  {{trigger.count}}"` returns the string `"Count: 5"`. Whole-field refs keep their type; mixed text
  coerces. Platforms that stringify everything silently flatten numbers and arrays and corrupt data one
  step downstream — a subtle bug users can't diagnose.
- **Missing path = error, not empty.** A mapping that points at nothing is an author bug; surfacing it at
  render time beats a silent blank that quietly breaks the run. (The lab plants the opposite — a
  silent-empty case that *should* error — for you to find.)
- **Immutable versions make runs explicable forever.** Editing a published relay creates a new draft; it
  never mutates history. A Run pins the version it started on, so "what did this relay look like when it
  ran?" always has an answer. That immutability is the precondition for S07 replay — you can't replay a
  definition that changed under you.
- **Schemas generate the UI.** The builder's step forms are built from each action's zod input schema
  (S3's triple-duty schemas). No per-connector UI code — the 10th connector gets a form for free. Where
  this breaks (dependent/dynamic fields) is a known S4 deferral with an escape hatch.
- **Reference validity is a graph property, enforced in two layers.** A step may reference only earlier
  steps. The builder's picker offers upstream refs only; the API *also* runs `assertUpstreamOnly` so a
  hand-crafted payload can't smuggle a forward reference past the UI. Defense in both layers.

## Exercise questions
1. Why is a `{{x}}`-only grammar safer than one with `+`, `||`, and function calls? Name the specific
   attack each added feature would enable, and why S10 must add them one at a time.
2. `{{trigger.count}}` vs `"Total: {{trigger.count}}"` — what type does each return, and construct a
   concrete downstream bug caused by coercing the first to a string.
3. Why must relay versions be immutable for S07 replay to be possible? What breaks if a run reads its
   definition live instead of pinning a version?
4. Upstream-only refs are enforced in the picker *and* the API. Give an attack that the API check stops
   which the picker alone would not.

## Lab (`lab/sprint-04`)
Three planted bugs to find with the sprint's own tools: a mapping picker offering *downstream* refs, a
type-coercion bug flattening arrays, and a missing-path case that silently returns empty instead of
erroring.

## Deferred (linked issues)
Transforms/filters in expressions (S10) · dependent/dynamic form fields · real sandboxed action
execution in test-run (needs the engine, S05) · the "no eval / no raw fetch" lint rules.

## Further reading
- Template-injection CVEs (SSTI) · Safe expression languages (JMESPath, CEL) · Immutable/versioned
  configuration · Schema-driven UI generation
