# Linear as the record of work

*3 October 2026. Decided with Tobi: "when you use Linear you don't need idle tasks." Built in idle-skills 0.9.4.*

## The decision

A first proposal put Linear *behind* idle-tasks, as a second store next to PGlite and Postgres. Tobi chose the other shape: with Linear, idle-tasks is not used at all. idle-skills talks to Linear directly through the Linear MCP, which every harness can already connect.

This works because idle-skills never touched storage. Its skills, personas and hooks only ever made the moves of the record — drop, structure, claim, feedback, decide, submit, read a brief or a tree — through `/idle`. In Linear mode the same moves are made through `/linear`.

## How it is switched on

`pipeline.config.yml`:

```yaml
tasks: linear
linear:
  team: ENG
  project: my-repo   # defaults to the repository's name
```

The skills that said "`/idle` says how" now say "`/idle` (or `/linear`)". The inject hook reads `tasks:`; in Linear mode it brings the check results and never starts idle, because a hook cannot reach the Linear MCP — the agent reads the tree itself.

## The mapping

Owned by `idle-skills/skills/linear/SKILL.md`: task = issue, tree = sub-issues, `needs` = blocked-by, sections of the description for goal, signs, scope, plan, interview and scenario, comments for feedback, verdicts and claims, decisions = issues labelled `decision`, states mapped onto the team's workflow (proposed → Triage/Backlog, open → Todo, claimed → In Progress, submitted → In Review, done → Done, blocked → Todo + `blocked`, archived → Canceled).

## What idle-tasks enforced that Linear does not

| idle-tasks | In Linear |
|---|---|
| The system runs the configured checks on submit and sends failures back | The PR's CI is the check: a submitted task moves on only when its PR is green |
| Claims are leases, refused while another live one holds | A claim comment with an expiry; agents read before claiming |
| Overlapping scopes cannot be claimed at once | The claimant compares `## Scope` sections of In Progress siblings |
| Claims are serialised in one transaction | No transactions: after claiming, re-read; the older live claim wins |
| Near-duplicate titles found by trigram search | `list_issues` query search before creating |

These are rules agents keep rather than refusals a system makes. That is the price of not running idle-tasks.

## Open

- idle-skills still declares idle-tasks as a plugin dependency, so it is installed in Linear mode but unused. Making the dependency optional differs per harness.
- What verifies when a repository has no CI. PR CI is the default the skill is written for.
