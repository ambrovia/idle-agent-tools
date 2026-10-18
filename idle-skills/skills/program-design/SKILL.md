---
name: program-design
description: "Interview the maintainer about how the program should work, and write it into the plan in plain words. Use when the approach is not obvious. Produces the how-it-works half of the plan — no contracts, types, or schemas."
persona: orchestrator
applies-to: [frontend, backend, application, framework, infra]
user-invocable: false
---

# Program design

Work out with the maintainer how the thing actually works — what happens, in what order, and why
that way rather than another. Like `/refine`, this is a conversation you conduct yourself.

Its output is the how-it-works half of the task's plan: an explanation someone could read once and
understand.

Plain words only. If a sentence could not be said out loud to someone who knows the domain but not
the codebase, it belongs in `/architecture`, not here.

## When it runs

Ambiguity decides, not size. An obvious solution needs no program design however large the work is; a
non-obvious approach needs it however small. If the maintainer already knows how it should work, take
that answer and stop.

## How to interview

**Ask in rounds**, numbered, over the questions whose prerequisites are settled. Structure each question
around the concrete tension in the codebase or domain that forces it, state what you currently assume, and
give a recommended answer so the maintainer can easily judge whether the question is sharp enough.

**Facts are your job.** How the current system works, what already exists, what a change would touch
— find out, dispatch a subagent to read widely where it is a lot, and bring back the answer. Ask the
maintainer only what needs their judgement.

**When ambiguity is high, go and reduce it.** Dispatch planner subagents to design or to work through
the technical shape, and bring what they find back into the conversation so the uncertainty can be
talked down. If what comes back is not good, the problem is usually the plan or the brief you gave
them — fix that and try again rather than accepting a bad answer.

**Their taste is only what they tell you here.** As in `/refine`: when the approach question is
unanswered for this task, ask. Never import it from another task or another conversation.
`{{rules.taste}}` and project memory hold repository-wide facts; assume the answer you need is not in
there. Answers to approach questions belong in this task's plan or task-bound decisions; record standing
`taste` in project memory only when the maintainer explicitly states a general repository-wide principle.

**Stop when the questions show you have it.** Reflect back how you understood the approach — including any
load-bearing assumptions you are relying on — and verify with the maintainer that the quality and
sharpness of your questions show you have understood the direction. As in `/refine`, if the maintainer
stops you early, distinguish whether the questions are sharp enough that program design is complete, or
too shallow from the start because the setup or codebase reading was wrong. Record load-bearing
assumptions in the record of work when present (or in the plan when run standalone). Do not treat
agreement as permission to start building.

## What to write

Into the **plan** (on the task in the record of work when present, or directly in the session when run
standalone), under `## How it works`, in plain language. Write only that half; `/refine`
owns `## What we need`. The whole plan is budgeted at 50–100 lines. Explain the path through the
program, not everything true about it. Append the full Q&A progression that settled the approach to the
**interview** so cold sessions recover the exact reasoning.

- how the program works — the path through it, in the order things happen;
- why it works that way, and what was rejected;
- where it touches what already exists;
- what is deliberately left simple, and what would have to change for that to stop being enough.

No call stacks, no signatures, no schemas, no file trees. Those are architecture's job, and only when
scope and complexity make them necessary.

## Boundaries

Do not write code, tests, or contracts. Do not expand scope — an approach that requires new outcomes
is a proposed amendment for the maintainer, or a new task of its own.

## Target

$ARGUMENTS
