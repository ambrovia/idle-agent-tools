---
name: work-planning
description: "Open a stream: create the root task for a piece of work and seed its interview. Maintainer-only. Use when a maintainer asks to add, split, or reshape work. Does not write the plan — the plan is written with the maintainer during refinement."
persona: any
applies-to: [frontend, backend, application, framework, infra]
argument-hint: "[short-title] (e.g. 'mobile-collapse')"
user-invocable: true
---

# Work planning

Open a stream — the root task for one piece of work — and leave it ready for the interview that writes
its plan. Establish that the work is worth doing; decide nothing about how it will be done.

A stream is as big as the work needs. There are no sizes and no tracks. Whether it is split, how deep,
and how many agents work it is decided later with the maintainer, and re-decided as evidence arrives.

## Authority boundary

Only a maintainer may invoke this skill. `/pipeline` and pipeline-spawned agents never open a stream
and never grow one. Work they find that belongs elsewhere is a proposed stream; only the maintainer
accepts it. During a run, missing or unstable scope is a blocker requiring maintainer input, not
permission to invoke `/work-planning`.

This skill does not write the plan. It creates the root with a seed; `/refine` and `/program-design`
fill it with the maintainer. Leave enough for the interview to start from and nothing that pre-empts it.

## Before opening

Confirm the pipeline is configured: `pipeline.config.yml` exists with `verify`, `paths`, `vcs` and
`engineering.tier` set, and every rule slot it declares points at a file that is present. An omitted or
null slot is a valid answer — skills skip absent slots. Offer `/setup` when the config is missing, when
a declared slot points at nothing, or when this work plainly turns on a convention the repository has
never written down.

`/idle` says how the record of work is read and written. List the project's streams, read
`pipeline.config.yml`, the project documentation under `{{paths.docs}}`, and enough source to understand
the existing capability. Ask only questions whose answers would change whether this stream should exist.
Offer an evidence-based read for the maintainer to confirm or correct.

Confirm:

1. **Value:** Name who benefits, what improves, and the concrete cost of not doing the work. Do not
   open work justified only by completeness, imitation, or "nice to have".
2. **Existing behavior:** Identify what already exists and isolate the genuine missing delta. Do not
   rebuild an existing capability. Use focused exploration when the answer is not readily visible.
3. **Stable frame:** The strategic boundary or load-bearing primitive this work sits in is established
   in configured project documentation. If it is missing or contested, stop for maintainer resolution.
4. **Dependencies:** Keep only streams that make this one impossible to implement or verify before
   they are done. Related work is not automatically a dependency.

Do not open research, exploration, or findings as the deliverable. Investigate enough to scope the
observable change, then open the work that acts on it.

## Open the stream

Create the root task:

- **title** — the domain title; it names branches and PRs later;
- **goal** — the seed, a few lines: who benefits, what improves, the cost of not doing it; what exists
  today; the specific gap this closes;
- **checks** — `{{verify}}`;
- **needs** — the streams from step 4, or none.

Write no acceptance criteria and no plan. If the record answers with similar live streams, stop and
show them to the maintainer rather than confirming past them.

Then return control to the maintainer. Do not invoke refinement, program design, or the pipeline unless
separately requested.

## Stop without opening when

- The beneficiary or missing delta is not credible.
- The strategic frame needs a maintainer decision.
- The proposed deliverable is investigation rather than an observable change.
- The work duplicates existing behavior or a live stream, or cannot be made independently coherent
  without reshaping scope.

State what is unresolved and the smallest decision needed to continue. Do not invent the answer to
make it succeed.

## Target

$ARGUMENTS
