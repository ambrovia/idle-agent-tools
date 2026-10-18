---
name: compound
description: "Review accumulated retros, identify recurring evidence-backed process patterns, and propose surgical skill or workflow changes for human approval. Never applies changes automatically."
argument-hint: "[optional: 'review' or 'status']"
persona: any
applies-to: [frontend, backend, application, framework, infra]
user-invocable: true
---

# Compound

Read project-wide decisions (`idle list --decisions`) and all decisions across roots
(`idle list --decisions --all`), then read every root task of this project (`idle list --archived` and
`show --state` or `list --search`) — including its `retro`, `outcome` (PR review comments, user feedback,
business KPIs, runtime signals), `interview` Q&A, and superseded assumptions. If a legacy
`.pipeline/compound-candidates.md` exists, read it too.

You run at maintainer cadence — after several tasks, never inside a run. Mine four sources of recurring
evidence across roots, including patterns that occurred inside sessions without causing a formal retro
failure:

1. **In-session taste nudges and `interview` Q&As** — where the maintainer repeatedly redirected
   recommendations or stated how they prefer things done (`kind = 'taste'` or repeated interview
   overrides), even when the task then succeeded smoothly;
2. **Repeated local `decisions` and invalidated `assumptions`** — where builders or planners across
   separate tasks had to make the same unguided choice or tripped over the same false premise;
3. **`retro` observations** (`success`, `friction`, `divergence`, `cost`);
4. **Outer `outcome` signals** — human PR review comments, user feedback, business KPIs, or post-ship
   regressions.

Group observations only when they describe the same behavioural or taste mechanism. Three independent
occurrences qualify a process/skill pattern for consideration; two independent occurrences across tasks
qualify a recurring in-session `taste` or domain convention. Track emerging candidates as project-wide
memory in `idle-tasks` (`idle decision` without `--task`) so candidate tracking never dirties git or
conflicts across branches.

Classify patterns as emerging, confirmed, contradicted, or resolved. Report each confirmed pattern to
the maintainer with:

- occurrences and evidence across roots/sessions;
- likely mechanism (including the underlying false assumption, where applicable) and competing explanation;
- behavior worth preserving;
- one smallest proposed change: a project-wide memory entry in `idle-tasks`, an amendment to a
  `.pipeline/rules/<slot>.md` file (`taste`, `code`, `testing`, `architecture`, `security`, `design-system`,
  `frontend`, `visual`, `docs`), or a surgical skill change;
- expected benefit, regression risk, and how to validate it.

Quote the corrections or repeated decisions the rule would have prevented. Never propose one from a
single occurrence, and propose a repository rule only when it holds across the repository — per-task
preferences belong in that task's plan, and rule files stay short enough to read.

Propose; never apply policy or rule-file edits without human approval. Do not delete history, convert
anecdotes into mandates, or bundle unrelated changes.

## Target

$ARGUMENTS
