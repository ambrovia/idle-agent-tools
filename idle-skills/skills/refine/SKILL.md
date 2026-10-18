---
name: refine
description: "Interview the maintainer about what they need from a task, and write it into the task in their words. Use when a dropped task's value, boundary, or a load-bearing noun is not already settled. Skip when it is already clear enough to build from."
persona: orchestrator
applies-to: [frontend, backend, application, framework, infra]
user-invocable: false
---

# Refine

Find out what the maintainer actually wants, and record it well enough that you can represent them
later when they are not in the room. This is a conversation, not a handoff — you conduct it yourself
and you do not spawn an agent to have it for you.

Anyone can drop a task at any time, and a dropped task is often no more than a title. This is where it
becomes something that can be worked: its output is the task's goal and the what-we-need half of its
plan, in the maintainer's own language, with the curated interview behind them.

## When it runs

Ambiguity decides. Run when the goal, the boundary, the beneficiary, or a load-bearing noun is
unresolved. Skip when the seed already answers those; a bugfix in an established context needs no
interview.

Read the task's state, the strategic frame in the project documentation under `{{paths.docs}}`, and
enough current behavior to ask informed questions.

The root is always interviewed when it needs it. A deeper task is interviewed again only where the
root's plan and interview, or what the maintainer has taught you about how they work, say they want a
say at that level. The higher in the tree, the more it is theirs.

## How to interview

**Your questions are how the maintainer judges whether you understand.** Generic or checklist questions
show you have not read enough yet; sharp questions that expose a concrete tension between the request
and the existing codebase or domain show you have grasped the boundary. Before asking a round, read
enough code to name the specific tension that forces each question and state what you currently assume.
If the maintainer says your questions are still too vague, stop asking and read deeper first.

**Ask in rounds.** Each round asks every open question whose prerequisites are settled — not one
question at a time, and not a wall of everything. Number them and give each a recommended answer.

**Facts are your job; decisions are theirs.** If the codebase, the docs, or the tracker can answer a
question, go find out — dispatch a subagent to read widely and report back rather than spending the
maintainer's attention or your own context on it. Only ask what genuinely requires their judgement.

**Their taste is only what they tell you here.** When you need to know how they want something and
this task's plan does not say, ask. Do not infer it from another task's plan, another conversation,
or a standing rule written for a different question — an answer carried in from elsewhere is your own
taste wearing a citation. When the maintainer overrides a recommendation or states a standing preference
during the interview, record it immediately as a `taste` decision in the record of work so later tasks
and `/compound` do not lose it when the task succeeds without friction.

`{{rules.taste}}` and project memory in the record of work hold hard facts that apply across the
repository — follow them, and expect them to answer almost nothing specific to this task.

**Is it worth doing at all?** Settle this before anything else, with evidence rather than a guess:

- who benefits, what improves, and the concrete cost of not doing it — not completeness, imitation, or
  "nice to have";
- what already exists, and the genuine missing delta; do not rebuild an existing capability;
- the observable change, not the investigation that leads to it;
- what it really depends on: only other tasks that make it impossible before they are done.

If the beneficiary or the delta is not credible, or it duplicates live work, say so and what smallest
decision would settle it. Do not invent the answer to keep the task alive.

**Stop at confirmation.** End the interview by reflecting back what you understood — including any
load-bearing assumptions you are making — and getting agreement. Record those load-bearing assumptions
with `decision --kind assumption`. Do not treat agreement as permission to start building.

## What to write

In plain language the maintainer would recognise as their own:

- **goal** — what they need, who it is for, and what is true when it is done, concretely enough to tell
  later whether it happened. This is the contract every task under it is read against;
- **plan**, under `## What we need` — the boundary, what is explicitly not in this task; any
  load-bearing noun, what it means here and which readings were rejected; their answers on how things
  should be done, wherever they gave one. `/program-design` owns `## How it works`;
- **how it is used** — on the root: how someone outside would use the result, written now, before
  anything is built;
- **interview** — the full Q&A progression that sharpened the understanding: the questions, the
  recommended answers, and the maintainer's answers in their own wording, including where they redirected
  the framing. Cold sessions read this to recover the exact state of understanding; leave out only
  unrelated chitchat.

Write acceptance criteria only where they sharpen the goal. They are signs of it, never a substitute;
agents that work to a list miss what the list was for.

The whole plan is budgeted at 50–100 lines. Stop when the maintainer would recognise their own intent,
not when the topic is exhausted.

## Boundaries

Record a newly discovered outcome as a **proposed amendment** and let the maintainer decide; do not
absorb it into scope. Genuinely separate work is its own task: drop it, and tell them.

Do not design the UI, choose an architecture, or write tests or code here.

## Target

$ARGUMENTS
