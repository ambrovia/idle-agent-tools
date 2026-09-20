---
name: retro
description: "Record concrete successes and friction after a stream, session, or pipeline run. Observe from artifacts and trajectories without fixing, assigning work, or changing process."
persona: any
applies-to: [frontend, backend, application, framework, infra]
user-invocable: false
---

# Retro

Read the stream's state — what came back and why, what was blocked, feedback from the work, superseded
decisions — then VCS history, verification/review output, lore, and session trajectories. The record
keeps no other history; the rest comes from those. Append terse observations to the stream's root as
feedback, one per entry, each starting `retro:`.

Each entry records kind (`success`, `friction`, `divergence`, or `cost`), source, the concrete
observation, its evidence, and optionally a related known pattern. Record what worked so later cleanup does not remove it.

A `divergence` entry records where the agent's choice was not what the maintainer wanted — read them
out of what they reopened, the decisions they superseded, and anything they asked to be changed or
simplified. Record the choice, what they wanted instead, and where the plan was silent. Do not write
the `taste` rule yourself, and never treat one correction as a convention.

Close each stream with one `cost` entry: what ran, how many critiques and reviews, how much was
re-done, and how much of the effort went to rework or infrastructure rather than the outcome.
Whether a run was proportionate is only visible in aggregate.

Read `.pipeline/compound-candidates.md` before writing a new free-text observation and reuse the
matching candidate's identifier when the same behaviour recurs; write free text only for friction
with no matching row. Read it, never write it — `/compound` owns that file. If it does not exist,
write free text and let `/compound` cluster it later.

Observe only. Do not diagnose beyond evidence, fix code or prompts, assign follow-up work, inflate one
event into a pattern, or duplicate an existing observation without new evidence.

Retro is the final mutable pipeline observation phase and must complete before ship runs.

## Target

$ARGUMENTS
