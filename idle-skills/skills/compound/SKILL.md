---
name: compound
description: "Review accumulated retros, identify recurring evidence-backed process patterns, and propose surgical skill or workflow changes for human approval. Never applies changes automatically."
argument-hint: "[optional: 'review' or 'status']"
persona: any
applies-to: [frontend, backend, application, framework, infra]
user-invocable: true
---

# Compound

Read project memory and all decisions across root tasks in the record of work when present, then read
this project's root tasks — including their `retro`, `outcome` (PR review comments, user feedback,
business KPIs, runtime signals), `interview` Q&A, and superseded assumptions. When `.pipeline/compound-candidates.md`
exists, or when running standalone without a task record, also read `.pipeline/compound-candidates.md`,
recent VCS history, merged pull requests and review comments, and session trajectories.

You run at maintainer cadence or on the weekly routine — after several tasks, never inside a run. Mine
four sources of recurring evidence across completed work, including patterns that occurred inside
sessions without causing a formal retro failure:

1. **In-session taste nudges and `interview` Q&As** — where the maintainer repeatedly redirected
   recommendations or stated how they prefer things done (`taste` decisions or repeated interview
   overrides), even when the task then succeeded smoothly;
2. **Repeated local `decisions` and invalidated `assumptions`** — where builders or planners across
   separate tasks had to make the same unguided choice or tripped over the same false premise;
3. **`retro` observations** (`success`, `friction`, `divergence`, `cost`);
4. **Outer `outcome` signals** — human PR review comments, user feedback, business KPIs, or post-ship
   regressions.

Group observations only when they describe the same behavioural or taste mechanism. Three independent
occurrences qualify a process/skill pattern for consideration; two independent occurrences across tasks
qualify a recurring in-session `taste` or domain convention. Track emerging candidates in project memory
when the record of work is present (or in `.pipeline/compound-candidates.md` when working without it) so
candidate tracking stays out of active feature branches.

Classify patterns as emerging, confirmed, contradicted, or resolved. Report each confirmed pattern to
the maintainer with:

- occurrences and evidence across roots/sessions;
- likely mechanism (including the underlying false assumption, where applicable) and competing explanation;
- behavior worth preserving;
- one smallest proposed change: a project-memory entry, an amendment to a `.pipeline/rules/<slot>.md`
  file (`taste`, `code`, `testing`, `architecture`, `security`, `design-system`, `frontend`, `visual`,
  `docs`), a `@lore` comment, or a surgical skill change;
- expected benefit, regression risk, and how to validate it.

Quote the corrections or repeated decisions the rule would have prevented. Never propose one from a
single occurrence, and propose a repository rule only when it holds across the repository — per-task
preferences belong in that task's plan, and rule files stay short enough to read.

Propose; never apply policy or rule-file edits without human approval. Do not delete history, convert
anecdotes into mandates, or bundle unrelated changes.

## Weekly routine

For a weekly scheduled run in any harness across all projects (or the current repository when run
standalone):

1. Find every project with new completed work, retros, outcomes, or decisions since the last compound
   pass (across projects in the record of work when present, or in the repository's recent VCS and PR
   history when standalone).
2. Run the four-source distillation above for each active project, recording new 1-occurrence candidates
   in project memory (or `.pipeline/compound-candidates.md`).
3. When a pattern reaches threshold (2+ independent occurrences for `taste`/domain conventions, 3+ for
   process/skill changes), drop a `proposed` root task in that project (or surface the proposal in the
   routine report when standalone) carrying the quoted evidence and exact proposed `.pipeline/rules/` or
   skill diff for human approval. Never edit rules or skills unattended.

## Target

$ARGUMENTS
