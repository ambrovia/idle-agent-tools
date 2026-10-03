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
| task | issue |
| root task, children | top-level issue, sub-issues (`parentId`) |
| `goal` | the description's first section, `## Goal` |
| `acceptance_criteria`, `scope`, `plan`, `interview`, `scenario` | description sections `## Signs the goal is reached`, `## Scope`, `## Plan`, `## Interview`, `## How it is used` — edit one section with `patch`, never rewrite the others |
| `needs` | `blockedBy` relations |
| `feedback`, `verdict` | comments starting `feedback (<who>):` and `verdict (<who>):` |
| decision | an issue labelled `decision` in the same project: the statement as title, the rationale as description, `relatedTo` every task it binds |
| `meta` (branch, worktree, PR) | link attachments (`links`) and the issue's git branch |

## States

| idle | Linear workflow state |
|---|---|
| proposed | Triage if the team has it, else Backlog |
| open | Todo |
| claimed | In Progress, with a claim comment |
| submitted | In Review, with the PR linked |
| done | Done |
| blocked | Todo, label `blocked`, and a `feedback` comment saying why |
| archived | Canceled — the root with every sub-issue under it |

There is no `verified`: see **Verification**.

A task is **ready** when it is in Todo without the `blocked` label, every `blockedBy` issue is Done, and
it has no sub-issues.

## Rules Linear does not enforce

idle-tasks refused these; here you keep them yourself. Read before you move, every time.

- **Claims are leases.** Claim by moving the issue to In Progress and commenting
  `claim (<who>): until <ISO time, 30 minutes from now>`. Extend with a new claim comment. A claim whose
  latest `until` has passed is anyone's. A live claim whose holder has gone quiet can be taken back to
  Todo by anyone, with a `verdict` comment saying why.
- **Scopes do not overlap.** Before claiming, list the In Progress issues in the same tree and read their
  `## Scope`. If a path in yours is the same as, inside, or around one in theirs, do not claim.
- **Two claims at once.** Linear has no transaction. After claiming, re-read the issue's comments: if
  another live claim comment is older than yours, yours lost: comment
  `released (<who>)`, move on.
- **Duplicates.** Before creating a task or a decision, search the project with `list_issues` `query` on
  the title or statement. If a live one says the same, use it.
- **Back to Todo always says why**, in a `verdict` comment.

**Say who you are on every comment** — `role/model` is enough (`builder/sonnet`, `reviewer/opus`). All
agents write through the same Linear user, so the comment is the only place who did what shows.

## Verification

No agent's word that the checks pass counts. The work goes up as a pull request linked to the issue, and
the repository's CI on that PR is the check. A submitted task moves on only when its PR's CI is green;
red CI sends it back to Todo with a `verdict` comment quoting the failure. With Linear's GitHub
integration on, merging the PR moves the issue to Done by itself.

## Who makes which move

As in `/idle`: whoever does a task claims it, records decisions, comments feedback, may create sub-issues
in Triage/Backlog when it is bigger than it looked, then exactly one of: submit (In Review with the PR),
block, or release. A reviewer moves In Review to Done or back to Todo with the blocking findings — never
for work they did. The planner creates and edits issues, accepts or declines proposals, unblocks, marks a
parent Done, supersedes decisions, archives. The human alone decides what a task is for and contradicts a
Done.

## Reading

- **A worker's brief:** `get_issue` with relations; the description of each ancestor up to the root (what
  it is for); the nearest `## Plan` going up; the `decision` issues related to it or an ancestor that are
  not Canceled; its `verdict` comments.
- **A tree's state:** `list_issues` with `parentId`, level by level from the root, `fields` `status`,
  `labels`, `parentId`, `updatedAt`. Needs attention: Triage/Backlog proposals, `blocked`, Todo with a
  `verdict`, In Review, parents whose sub-issues are all Done, tasks bound by a Canceled decision.

Never plan from memory of a conversation.

## Target

$ARGUMENTS
