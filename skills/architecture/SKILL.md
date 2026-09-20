---
name: architecture
description: "Work out the technical shape of an agreed plan — contracts, types, schemas, dependency order — and propose it as tasks and decisions. Use only where scope and complexity make those definitions necessary. Never decides how the program works; that is the plan's job."
persona: pipeline-planner
applies-to: [frontend, backend, application, framework, infra]
user-invocable: false
---

# Architecture

Turn the plan into work a builder can start from: **proposed tasks**, each a more detailed goal, and
**decisions** for every choice that must not be re-made downstream. The plan owns what is wanted and how
the program works; approved design constrains the surface. Architecture must not create scope, and it
never creates work itself — whoever plans the stream accepts, edits or declines what you propose.

**Run only where the definitions are genuinely necessary** — where scope and complexity mean a builder
cannot proceed without contracts, types, schemas, or an explicit dependency order. Most items do not
need this.

This is the *technical interpretation* of a plan that already exists: the same thing the plan says in
plain words, in the vocabulary a builder needs. If you find yourself deciding how the program works,
stop — that decision belongs in the plan, with the maintainer.

Put each contract where its builder will read it: in the goal of the task that implements it, or in a
decision when several tasks are bound by it.

## Understand and verify

Start from the brief of the task you were given, then read approved design when present, the
`pipeline.config.yml` rule slots that apply (`{{rules.architecture}}`,
`{{rules.code}}`, `{{rules.testing}}`, `{{rules.security}}` — skip undeclared slots), relevant source,
current repository structure, and any `@lore` on the surfaces this change touches. Ask only questions that
change a costly or cross-cutting decision.

Run a focused feasibility probe only when a load-bearing assumption is new, unknown, or contradicted by
available evidence. When the premise depends on deployed or live state (bucket contents, running jobs,
live rows, remote config, external behavior), probe that live surface — a repo read is not enough; if
unreachable, mark it `UNVERIFIED`. Report the reproducible question, method, result, and verdict; record what it settles as a decision. A
probe reduces uncertainty and does not become a deliverable.

Reconcile the requested outcome with reality. Verify that every symbol the plan or spec names — table,
route, component, constant, export — exists in the shape assumed, and record each disagreement with how
the plan handles it. Where the change renames, moves, or removes an existing symbol, derive its consumers
from the repository rather than from the list the spec supplied; specs undercount this, and the plan is
where the real number has to appear. If reconciliation requires a new outcome or contradicts the plan,
propose a plan amendment and stop. If it invalidates approved design, return an explicit design-change
proposal.

## Propose the work

The tasks you propose *are* the mapping from the goal to its implementation: together they must cover
the parent's goal and add nothing to it. Between them, the goals and decisions carry what a cold
builder needs:

- existing behavior being reused and the actual change boundary;
- public/cross-layer contracts, data flow, persistence or migration semantics where applicable;
- plausible changed failure behavior appropriate to the tier;
- security reasoned from the surfaces this change actually reaches — a state-changing endpoint, untrusted
  input, a credential, a path, an outbound request, an agent-authored field. For each, reason from current
  best practice for that kind of surface, state the abuse case and how the plan closes it, and say plainly
  which surfaces this change does not touch. `{{rules.security}}` carries the project's threat model and
  governs where it is configured; its absence is not permission to skip the reasoning;
- load-bearing files/modules as each task's `scope`, derived from the repository, and real dependency
  order as `needs`;
- verification approach using existing lanes where adequate, including the one piece of end-to-end
  evidence that will show the change working through its real consuming path in production conditions —
  an integration or E2E test, a scripted run, or a specific manual check with its expected observation.
  Name the cheapest form that would actually catch a broken wire; do not mandate a new harness when an
  existing lane or a recorded manual check suffices. It is the goal of the integrate task;
- documentation made false by the change.

Lock irreversible, public, cross-cutting, compatibility-sensitive, or expensive choices. Leave naming
inside a local function, helper layout, and other reversible details to the builder. Prefer one task.
Split only at a real dependency or safe parallel boundary, with scopes that do not overlap; add an
integrate task only for a real seam between tasks. Do not specify parallelism or agent counts here;
those are chosen at runtime.

For migrations, renames, shared files, protected tests, or concurrency, state the concrete invariant and
name the affected sites — source, fixtures, tests — with the step each one needs. Do not add a mechanism,
abstraction, rollback layer, observability, compatibility shim, or failure-handling path the goal, a
configured rule, or a plausible change-caused risk does not call for — tier sets rigor, not ambition.

## Done

The proposal is implementable without product or structural invention, stays proportionate to the tier,
names reliable verification, and traces every task to the goal it serves. Submit with the proposal in
place. The plan changes only through an approved amendment.

## Target

$ARGUMENTS
