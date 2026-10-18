---
name: retro
description: "Record concrete successes and friction after a task, session, or pipeline run. Observe from artifacts and trajectories without fixing, assigning work, or changing process."
persona: any
applies-to: [frontend, backend, application, framework, infra]
user-invocable: false
---

# Retro

Read the tree's state — what came back and why, what was blocked, feedback from the work, superseded
decisions and assumptions, outer `outcome` entries, and the mechanical counters in `metadata`
(`check_failures`, `review_bounces`, `reopens`) — then VCS history, verification/review output, lore,
and session trajectories. Append terse observations to the root task's `retro` field (`idle task --id <root> --retro "…"`),
never to the git working tree. Because `retro` lives in the record of work, it runs after `/ship`
without dirtying the branch or racing with CI.

Each entry records kind (`success`, `friction`, `divergence`, or `cost`), source, the concrete
observation, its evidence, and optionally a related known pattern. Record what worked so later cleanup
does not remove it.

A `divergence` entry records where the agent's choice was not what the maintainer wanted — read them
out of what they reopened, the decisions or assumptions they superseded, in-session `taste` nudges, and
anything they asked to be changed or simplified. Record the choice, **the underlying assumption that
failed**, what they wanted instead, and where the plan was silent. Do not write `.pipeline/rules/`
yourself, and never treat one correction as a convention.

Close each root task with one `cost` entry using the mechanical bounce counters (`check_failures`,
`review_bounces`, `reopens`) plus what ran, how many critiques and reviews occurred, and how much of the
effort went to rework or infrastructure rather than the outcome. Whether a run was proportionate is only
visible in aggregate.

Read project-wide decisions (`idle list --decisions`) and, if present, `.pipeline/compound-candidates.md`
before writing a new free-text observation, and reuse the matching candidate's identifier when the same
behaviour recurs; write free text only for friction with no matching entry. Read them, never mutate
candidate state here — `/compound` owns that.

Observe only. Do not diagnose beyond evidence, fix code or prompts, assign follow-up work, inflate one
event into a pattern, or duplicate an existing observation without new evidence.

## Target

$ARGUMENTS
