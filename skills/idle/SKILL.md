---
name: idle
description: "Read and write the shared record of work: tasks that form streams, and decisions. Use whenever work is coordinated through the task backend — to open or decompose a stream, claim a task, give feedback, record a decision, submit, or see where a stream stands. Workflow-neutral."
persona: any
applies-to: [frontend, backend, application, framework, infra]
user-invocable: true
---

# Idle

The record of work. Agents do not talk to each other; they read and write this. What is not written
here does not exist for the next session.

## What is in it

A **task** is a goal. Its `goal` — what is true when it is done, and why it matters — is the contract.
`acceptance_criteria` are signs that the goal is reached, and `checks` are commands that must pass;
both help you tell, neither replaces the goal. A task whose signs all pass while its goal is missed is
not done.

Tasks nest. A child is a more detailed goal than its parent. A task with no parent is a **stream**:
one piece of work, as big as it needs to be. `needs` names tasks that must be done first. `scope`
names what a task touches — paths, modules, systems; two tasks whose scopes overlap cannot be claimed
at the same time.

A stream's `plan` is the condensed, worker-facing plan; its `interview` is the curated Q&A it came
from. Both sit on the root, and on any deeper task that needed its own.

A **decision** is one line anyone may record when they had to choose. It binds the task it was made on
and any task named with it. Decisions are searched before they are recorded, and superseded rather than
edited.

`feedback` on a task is for whoever plans the stream: the goal is wrong, the approach will not work, a
decision conflicts, what you learned by doing. `verdict` is why a task came back: a failed check,
blocking findings, the reason it was reopened.

## States

```
proposed → open → claimed → submitted → verified → done
                     ↓          ↓           ↓        ↓
                  blocked     open        open     open      (back to open always says why, in verdict)
```

- A task is **ready** when it is open, everything it `needs` is done, and it has no children. A task
  with children is never claimed; it is done when its children are and its own goal is reached.
- **claimed** is a lease. Claim again to extend it. An expired lease is anyone's.
- **submitted** is as far as whoever did the work can move it. With no checks it passes straight to
  verified; where review is off, verified is done.
- **archived** takes a stream, and everything under it, out of play.

## Operations

Four, offered as MCP tools and as the `idle` command with the same names and inputs. Use the tools
when the session has them.

| | |
|---|---|
| `task` | Create or update. Without `id` it creates — after searching: if similar live tasks exist it returns them instead, and `confirm` creates anyway. With `id` it changes fields, moves the task with `status`, appends `feedback` or `verdict`. |
| `decision` | Create or update, the same way. `superseded-by` retires one. |
| `show` | One task or decision. `brief`: what a worker starts from. `state`: the whole stream — what needs attention, feedback, tree, ready, claims, recently done. |
| `list` | Streams of this project; with `root` its tree; with `ready` what can be claimed; with `decisions` a stream's decisions. |

`idle help <operation>` lists every input. Say who you are with `by` — `harness/model` is enough.

## Who makes which move

| You are | You may |
|---|---|
| doing a task | claim it; extend the lease; record decisions; append feedback; create `proposed` children when it is bigger than it looked; then exactly one of: submit, block with feedback, or release |
| re-running checks | move `submitted` to `verified`, or back to `open` with what failed |
| reviewing | move `verified` to `done`, or back to `open` with the blocking findings — never for work you did |
| planning the stream | create and edit tasks; accept a proposal (`open`) or decline it (`archived`); unblock; mark a parent `done`; supersede decisions; archive |
| the human | everything above, and alone: decide what a stream is for, accept a new stream, contradict a `done` |

Read before you move: `show --brief` before working a task, `show --state` before planning a stream.
Never plan from memory of a conversation.

## Starting a worker

A worker needs nothing but its brief. Start a session in any harness with the brief as the prompt and
`IDLE_BY` set to who it is: `IDLE_BY=<harness>/<model> <harness> "$(idle show <id> --brief)"`.

## Keeping a stream alive

For a scheduled run in any harness. Each step is one read and at most one move:

1. `show --state` on each open stream of the project.
2. For each `submitted` task: run its checks where the work is; move it to `verified` or back to `open`.
3. If anything else needs attention, start one planning session on that stream.

## Target

$ARGUMENTS
