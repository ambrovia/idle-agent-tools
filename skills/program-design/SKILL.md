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

**Ask in rounds**, numbered, each with a recommendation, over the questions whose prerequisites are
settled.

**Facts are your job.** How the current system works, what already exists, what a change would touch
— find out, dispatch a subagent to read widely where it is a lot, and bring back the answer. Ask the
maintainer only what needs their judgement.

**When ambiguity is high, go and reduce it.** Dispatch planner subagents to design or to work through
the technical shape, and bring what they find back into the conversation so the uncertainty can be
talked down. If what comes back is not good, the problem is usually the plan or the brief you gave
them — fix that and try again rather than accepting a bad answer.

**Their taste is only what they tell you here.** As in `/refine`: when the approach question is
unanswered for this task, ask. Never import it from another task or another conversation.
`{{rules.taste}}` holds a handful of repository-wide facts; assume the answer you need is not in
there.

**Stop at confirmation.** Reflect back how you understood it and get agreement. Do not treat that
agreement as permission to start building.

## What to write

Into the task's **plan**, under `## How it works`, in plain language. Write only that half; `/refine`
owns `## What we need`. The whole plan is budgeted at 50–100 lines. Explain the path through the
program, not everything true about it. Add the questions that mattered, and their answers, to the
**interview**.

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
