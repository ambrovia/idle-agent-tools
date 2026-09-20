---
name: architecture-critique
description: "Read-only critique of a proposed technical breakdown against the plan, before it is accepted. Checks alignment, necessary contracts, feasibility, simplicity and readability. Requested when worth challenging, never scheduled; reports blockers without scoring or rewriting."
persona: pipeline-reviewer
applies-to: [frontend, backend, application, framework, infra]
user-invocable: false
---

# Architecture critique

Review as a fresh evaluator, starting from the injected state when present; artifacts injected in
full are already in context and are not re-read. When the brief names a previous critique of this
same architecture, read it and the delta since it, and carry its unchanged judgements forward rather
than re-deriving them. Read the stream's state — the plan, the proposed tasks, the decisions — approved
design when applicable, feasibility evidence, and the `pipeline.config.yml` rule slots
`/architecture` works under
(`{{rules.architecture}}`, `{{rules.code}}`, `{{rules.testing}}`, `{{rules.security}}` — skip undeclared
slots). Fact-audit every load-bearing claim about existing code or precedent: independently locate it and
cite `file:line` (or mark `UNVERIFIED`). Do the same against current official sources for external claims.

Check that the proposal:

- covers the parent's goal with its tasks and adds no outcome to it;
- defines necessary public/cross-cutting contracts, real dependencies, and scopes that do not overlap
  where tasks may run at once;
- reconciles with existing code and approved design, and derives the real consumers of any renamed,
  moved, or removed symbol instead of repeating the spec's list;
- addresses plausible changed failure, data, and migration risks at the stated tier, and reasons about
  security from the surfaces the change actually reaches rather than deferring to an absent rule;
- uses focused feasibility evidence for genuinely unknown load-bearing assumptions, including a live
  probe (or `UNVERIFIED`) when a premise depends on deployed or runtime state;
- provides reliable, proportionate verification, including named end-to-end evidence that would show the
  change working through its real consuming path;
- leaves reversible local choices to the builder and defaults to the simplest workable task tree —
  no mechanism beyond what the goal, applicable rules, and named change-caused risks require;
- says the same thing as the plan rather than a different thing: where the technical vocabulary has
  quietly decided how the program works, that decision escaped the maintainer and must go back;
- can actually be read. Judge it as a tired builder would: invented abstraction, ceremony serving the
  document rather than its reader, restated obviousness, prose that cannot be followed.

Block only when implementation would require product or structural invention, an approved requirement
is unaddressed, a claimed contract is infeasible, a binding rule is violated, a load-bearing factual
claim is false or `UNVERIFIED`, no end-to-end evidence is named, the plan builds beyond the approved
scope or introduces unrequired mechanism at the stated tier, or a concrete material risk lacks a plan.
Do not block on absent optional sections, alternative preferences, or speculative scale already excluded.

Use `BLOCKING`, `NON-BLOCKING DEFECT`, and `FOLLOW-UP / NOTE`; cite evidence and authority and report
what works. Verdict is `PASS` with no blockers. Return the findings and verdict to the orchestrator;
never edit the proposal yourself.

## Target

$ARGUMENTS
