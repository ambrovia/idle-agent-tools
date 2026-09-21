---
name: idle
description: "Read and write the shared record of work: tasks that nest into trees, and decisions. Use whenever work is coordinated through the task backend — to drop a task, structure one into a tree, claim a task, give feedback, record a decision, submit, or see where a piece of work stands. Workflow-neutral."
persona: any
applies-to: [frontend, backend, application, framework, infra]
user-invocable: true
---

# Idle

The record of work. Agents do not talk to each other; they read and write this. What is not written
here does not exist for the next session.

## What is in it

A **task** is a goal. Its `goal` — what is true when it is done, and why it matters — is the contract.
`acceptance_criteria` are signs that the goal is reached; they help you tell and never replace the goal. A task whose signs all pass while its goal is missed is
not done.

**Anyone can drop a task at any time.** A title is enough; it does not have to be well formed. It
starts as a single root task, and refining and planning may grow it into a tree — or not, when one
session can simply do it.

Tasks nest. A child is a more detailed goal than its parent. `needs` names tasks that must be done first. `scope`
names what a task touches — paths, modules, systems; two tasks whose scopes overlap cannot be claimed
at the same time.

A task's `plan` is the condensed, worker-facing plan; its `interview` is the curated Q&A it came from.
Both sit on the root once it has been refined, and on any deeper task that needed its own.

A **decision** is one line anyone may record when they had to choose. It binds the task it was made on
and any task named with it. Decisions are searched before they are recorded, and superseded rather than
edited.

`feedback` on a task is for whoever plans the tree: the goal is wrong, the approach will not work, a
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
- **submitted** is as far as whoever did the work can move it. The system then runs the project's
  checks itself — shell commands configured on the machine, never taken from a task, run where the work
  is — and moves the task to verified, or back to open with the output. No agent is asked and no agent's
  word counts. With no checks configured it passes straight through; where review is off, verified is
  done.
- **archived** takes a task out of play — a root with everything under it.

## Operations

Four, offered as MCP tools and as the `idle` command with the same names and inputs. Use the tools
when the session has them.

| | |
|---|---|
| `task` | Create or update. Without `id` it creates — after searching: if similar live tasks exist it returns them instead, and `confirm` creates anyway. With `id` it changes fields, moves the task with `status`, appends `feedback` or `verdict`. |
| `decision` | Create or update, the same way. `superseded-by` retires one. |
| `show` | One task or decision. `brief`: what a worker starts from. `state`: the whole tree it belongs to — what needs attention, feedback, tree, ready, claims, recently done. |
| `list` | Root tasks of this project; with `root` one of them as a tree; with `ready` what can be claimed; with `decisions` the decisions made in a tree. |

`idle help <operation>` lists every input.

**Say who you are on every call, with `by`** — `role/model` is enough (`builder/sonnet`, `reviewer/opus`).
Agents started inside one session otherwise all look like that session, and a reviewer that looks like
the worker is refused.

## Who makes which move

| You are | You may |
|---|---|
| anyone | drop a task |
| doing a task | claim it; extend the lease; record decisions; append feedback; create `proposed` children when it is bigger than it looked; then exactly one of: submit, block with feedback, or release |
| reviewing | move `verified` to `done`, or back to `open` with the blocking findings — never for work you did, and never leave it where it was: what needs it waits for `done` |
| planning a tree | create and edit tasks; accept a proposal (`open`) or decline it (`archived`); unblock; mark a parent `done`; supersede decisions; archive |
| the human | everything above, and alone: decide what a task is for and how far it goes, contradict a `done` |

Read before you move: `show --brief` before working a task, `show --state` before planning a tree.
Never plan from memory of a conversation.

## Checks

`~/.idle/config.json` names the commands that verify each project's work:
`{ "checks": { "<project>": ["npm run verify"] }, "review": true }`. The project is the repository
folder's name; `idle doctor` prints it and the checks it found. A wrong key means no checks, silently. They run on the machine that
submits, in the worktree recorded on the task or the nearest task above it (`meta: {"worktree": …}`). `review` makes a verified task wait for
someone who did not do the work.

## Starting a worker

A worker needs nothing but its brief. Start a session in any harness with the brief as the prompt and
`IDLE_BY` set to who it is: `IDLE_BY=<harness>/<model> <harness> "$(idle show <id> --brief)"`.

## Keeping work alive

For a scheduled run in any harness. Each step is one read and at most one move:

1. `show --state` on each open root task of the project.
2. A task still `submitted` means its checks never finished: submit it again, where the work is.
3. If anything else needs attention, start one planning session on that root.

## Target

$ARGUMENTS
