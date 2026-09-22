---
name: write-code
description: "Implement a claimed task with the smallest clear solution that reaches its goal. Use after the plan is agreed and the task is yours."
persona: pipeline-builder
applies-to: [frontend, backend, application, framework, infra]
user-invocable: false
---

# Write code

Start from the task's brief — its goal, what it is for, the plan, decisions in force, and why it came
back if it did. Claim the task before the first edit. Then read approved design when present, the applicable
`pipeline.config.yml` rule slots (`{{rules.code}}`, `{{rules.architecture}}`, `{{rules.design-system}}`,
`{{rules.frontend}}`, `{{rules.security}}` — skip undeclared slots), and relevant existing code.

The goal is the contract. Acceptance criteria are signs of it and checks are a floor; satisfying both
while missing the goal is not done. Implement the goal and, on a task that came back, what it came
back for — nothing else.

Use the simplest repository-native solution. Reuse existing abstractions; add one only when the current
change needs it. Preserve compatibility, migrations, security boundaries, UI behavior, and ownership
explicitly required by the plan or applicable project rules. Make local reversible choices without
returning to architecture, and record a non-obvious one as `@lore` where it lives rather than leaving the
next reader to rediscover it.

Commit at each completed task boundary. An interrupted session then resumes from the last commit instead
of stranding work in a dirty tree.

Use focused checks while building; do not run `{{verify}}` after every edit. Run it when the integrated
implementation is ready, and rerun it only after later changes invalidate the result. Run each check
once and wait for it; never re-invoke a command to poll its status. Mechanical check results injected
at skill load or with a retry brief are evidence — act on them rather than re-running them. Each is
stamped with the tree it ran on: a skill-load result is the starting baseline, never the completion
gate. Add tests only for approved behavior where they can catch a meaningful regression. Do not weaken
tests, edit outside the task's scope, perform adjacent cleanup, add speculative capability, or redesign around a plan contradiction.
Raise a blocker with evidence when new scope or a changed structural decision is required.

Submit only when the goal is reached and shown to be — `{{verify}}` green, and the change working through its real consuming path where the goal names one —
change-caused regressions are fixed, and the diff contains no unrelated work and no task id. Report
pre-existing failures separately. When you submit, the system runs the project's checks itself; a failure
reopens the task with the output, whatever you reported.

A choice you had to make where the plan was silent is a **decision**: record it as one, so it binds the
tasks after yours and the maintainer can find and overturn it. Feedback is not the place for it. Write
feedback on the task for anything
learned by doing that whoever plans the tree should know: the goal is wrong, the approach will not
work, a decision conflicts. End in exactly one way: submit; propose children when the task is bigger
than it looked, and release it; or block with the reason. A task that is merely not ready yet — what it
needs is unfinished — is not blocked: leave it, and say so in your report. `/idle` says how.

## Target

$ARGUMENTS
