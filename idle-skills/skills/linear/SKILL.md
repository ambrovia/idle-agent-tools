---
name: linear
description: "Read and write the record of work in Linear instead of idle-tasks: tasks as issues that nest into sub-issues, and decisions. Use in place of /idle whenever pipeline.config.yml sets `tasks: linear` — to drop a task, structure one into a tree, claim, give feedback, record a decision, submit, or see where work stands."
persona: any
applies-to: [frontend, backend, application, framework, infra]
user-invocable: true
---

# Linear

The record of work, kept in Linear. Agents do not talk to each other; they read and write this. What is
not written here does not exist for the next session. Everything `/idle` says about what a task *is* —
the goal is the contract, anyone may drop one, children are more detailed goals, decisions are searched
before they are recorded — holds here unchanged. This skill says how each move is made with the Linear
MCP tools (`list_issues`, `get_issue`, `save_issue`, `save_comment`, `list_comments`) and which rules
you keep yourself, because Linear does not enforce them.

## Where

`pipeline.config.yml`:

```yaml
tasks: linear
linear:
  team: ENG             # the Linear team issues are created in
  project: my-repo      # optional; defaults to the repository's name
```

Every issue you create goes in that team and project. Every list you read is filtered to that project.
If the Linear MCP tools are not available in this session, stop and say so; do not fall back to `/idle`.

## What is in it

| idle | Linear |
|---|---|
| task | issue without the `decision` label |
| root task, children | top-level issue, sub-issues (`parentId`) |
| `goal` | the description's first section, `## Goal` |
| `acceptance_criteria`, `scope`, `plan`, `interview`, `scenario` | description sections `## Signs the goal is reached`, `## Scope`, `## Plan`, `## Interview`, `## How it is used` — edit one section with `patch`, never rewrite the others |
| `meta` on the root: branch, worktree, `since` | a `## Work` section on the root: `branch:`, `worktree:`, `since:` (the commit the worktree was cut from) |
| `needs` | `blockedBy` relations |
| `feedback`, `verdict` | comments starting `feedback (<who>):` and `verdict (<who>):` |
| decision | an issue labelled `decision` in the same project: the statement as title, the rationale as description, `relatedTo` every task it binds |
| the PR | a `links` attachment on the root, added at `/ship` |

**Decisions are never tasks.** A decision is created straight in Done (in force) and moved to Canceled
when superseded. Every task query below excludes the `decision` label; filter it out of every list you
read.

## States

| idle | Linear workflow state |
|---|---|
| proposed | Triage if the team has it, else Backlog |
| open | Todo — where a dropped task starts, unless it is work you found rather than were given |
| claimed | In Progress, with a claim comment |
| submitted | In Review |
| done | Done |
| blocked | Todo, label `blocked`, and a `feedback` comment saying why; unblock by removing the label |
| archived | Canceled — the root with every sub-issue under it |

There is no `verified`: see **Verification**. Review is always on.

A task is **ready** when it is in Todo without the `blocked` label, every `blockedBy` issue is Done, and
it has no sub-issues.

## Rules Linear does not enforce

idle-tasks refused these; here you keep them yourself. Read before you move, every time.

- **Claims are leases.** Claim by moving the issue to In Progress and commenting
  `claim (<who>): until <ISO time, 30 minutes from now>`. Extend with a new claim comment. A claim whose
  latest `until` has passed is anyone's. A live claim whose holder has gone quiet can be taken back to
  Todo by anyone, with a `verdict` comment saying why.
- **Scopes do not overlap.** Before claiming, list the project's In Progress issues and read the `## Scope`
  of each one whose claim is live. If a path in yours is the same as, inside, or around one in theirs, do
  not claim. An In Progress issue whose lease has run out does not block you.
- **Two claims at once.** Linear has no transaction. After claiming, re-read the issue's comments: if
  another live claim comment is older than yours, yours lost: comment `released (<who>)` and move on.
- **Duplicates.** Before creating a task or a decision, search the project with `list_issues` `query` on
  the title or statement. If a live one says the same, use it.
- **Back to Todo always says why**, in a `verdict` comment.

**Say who you are on every comment** — `role/model` is enough (`builder/sonnet`, `reviewer/opus`). All
agents write through the same Linear user, so the comment is the only place who did what shows.

## Verification

The worker's word that the checks pass does not count. A task is submitted by moving it to In Review.
Its reviewer — never whoever did the work — runs `{{verify}}` in the root's worktree before judging
anything else; red sends the task back to Todo with a `verdict` comment quoting the failure, whatever the
worker reported. Green, the reviewer judges the goal and moves the task to Done or back to Todo.

The root is verified a second time at `/ship`: the PR's CI must be green before the root is marked Done.
Linking the PR is a `links` attachment on the root, added by hand. Task ids stay out of branch, commit
and PR names, so Linear's GitHub integration does not link them; if a team links them anyway, turn its
automatic state changes off for that team, or they skip the reviewer.

## Who makes which move

As in `/idle`: whoever does a task claims it, records decisions, comments feedback, may create sub-issues
in Triage/Backlog when it is bigger than it looked, then exactly one of: submit (In Review), block, or
release. A reviewer moves In Review to Done or back to Todo with the blocking findings — never for work
they did. The planner creates and edits issues, accepts a proposal (Todo) or declines it (Canceled),
unblocks, marks a parent Done, supersedes decisions, archives. The human alone decides what a task is for
and contradicts a Done.

**Superseding a decision:** record the new one, move the old one to Canceled, relate the two
(`relatedTo`), and comment `superseded by <id> (<who>)` on the old one. Tasks bound by it now need
re-planning.

## Reading

- **Root tasks:** `list_issues` in the project with `fields` `title`, `status`, `parentId`, `labels`,
  `updatedAt`; keep those without a `parentId` and without the `decision` label. Most recently touched
  first.
- **A worker's brief:** `get_issue` with relations; the description of each ancestor up to the root (what
  it is for); the nearest `## Plan` going up; the root's `## Work`; the `decision` issues related to it or
  an ancestor that are not Canceled; its `verdict` comments.
- **A tree's state:** `list_issues` with `parentId`, level by level from the root, `fields` `status`,
  `labels`, `parentId`, `updatedAt`. Needs attention: Triage/Backlog proposals, `blocked`, Todo with a
  `verdict`, In Review (waiting for a reviewer), parents whose sub-issues are all Done, tasks bound by a
  Canceled decision.
- **What a reviewer picks up:** In Review issues in the project, without the `decision` label.
- **The diff to review:** `git diff <since>` in the root's worktree, from its `## Work`. The hooks do not
  inject it in Linear mode.

Never plan from memory of a conversation.

## Keeping work alive

For a scheduled run in any harness. Each step is one read and at most one move:

1. Read the state of each open root task of the project.
2. In Progress with every lease run out: back to Todo, with a `verdict` saying the claim lapsed.
3. If anything else needs attention, start one planning session on that root.

## Agents need the tools

The generated Claude agents allow MCP servers by name. They allow the Linear MCP under the names
`linear`, `claude_ai_Linear` and `plugin_linear_linear`. If yours is connected under another name, add
`mcp__<name>` to the `tools:` line of the agents, or the planner, builder and reviewer cannot reach the
record.

## Target

$ARGUMENTS
