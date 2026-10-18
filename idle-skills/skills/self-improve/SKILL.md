---
name: self-improve
description: "Review accumulated retros, outcomes, interviews, and decisions to identify recurring evidence-backed patterns and propose surgical rule, memory, or skill changes for human approval. Works both when triggered manually and on a weekly schedule. Never applies changes automatically."
argument-hint: "[optional: 'review', 'status', or focus area]"
persona: any
applies-to: [frontend, backend, application, framework, infra]
user-invocable: true
---

# Self-Improve

Run either **manually on demand** (when the maintainer invokes `/self-improve` in a session) or **on the
weekly schedule** (`## Weekly routine`), after several tasks — never inside an active build loop.

Read project memories (`decision`, `assumption`, `taste`, and `retro` entries) in the record of work
when present, then read this project's root tasks — including their `outcome` (PR review comments, user
feedback, business KPIs, runtime signals) and `interview` Q&A. When
`.pipeline/compound-candidates.md` exists, or when running standalone without a task record, also read
`.pipeline/compound-candidates.md`, recent VCS history, merged pull requests and review comments, and
session trajectories.

Mine four sources of recurring evidence across completed work, including patterns that occurred inside
sessions without causing a formal retro failure:

1. **Repeated steering in `interview` Q&As and standing `taste` memories** — where the maintainer
   repeatedly redirected recommendations in the same direction across separate tasks (distinguishing
   recurring general taste from a localized answer to a single question);
2. **Repeated local `decision` memories and invalidated `assumption` memories** — where builders or
   planners across separate tasks had to make the same unguided choice or tripped over the same false
   premise;
3. **`retro` memories** (`success`, `friction`, `divergence`, `cost`);
4. **Outer `outcome` signals** — human PR review comments, user feedback, business KPIs, or post-ship
   regressions.

Group observations only when they describe the same behavioural or taste mechanism. Three independent
occurrences qualify a process/skill pattern for consideration; two independent occurrences across separate
tasks qualify a recurring general `taste` or domain convention. Track emerging candidates in project
memory when the record of work is present (or in `.pipeline/compound-candidates.md` when working without
it) so candidate tracking stays out of active feature branches.

When triggered manually, present each confirmed pattern directly to the maintainer in the session with:

- occurrences and evidence across roots/sessions;
- likely mechanism (including the underlying false assumption, where applicable) and competing explanation;
- behavior worth preserving;
- one smallest proposed change: a project-memory entry, an amendment to a `.pipeline/rules/<slot>.md`
  file (`taste`, `code`, `testing`, `architecture`, `security`, `design-system`, `frontend`, `visual`,
  `docs`), a `@lore` comment, or a surgical skill change;
- expected benefit, regression risk, and how to validate it.

Quote the corrections or repeated decisions the rule would have prevented. Never propose one from a
single occurrence, and propose a repository rule or standing taste only when it holds across the
repository — localized choices belong in that task's plan, and rule files stay short enough to read.

Propose; never apply policy or rule-file edits without human approval. Do not delete history, convert
anecdotes into mandates, or bundle unrelated changes.

## Weekly routine

When triggered by a weekly scheduled automation in any harness across all projects (or the current
repository when run standalone):

1. Find every project with new completed work, retros, outcomes, or decisions since the last
   `/self-improve` pass (across projects in the record of work when present, or in the repository's recent
   VCS and PR history when standalone).
2. Run the four-source distillation above for each active project, recording new 1-occurrence candidates
   in project memory (or `.pipeline/compound-candidates.md`).
3. When a pattern reaches threshold (2+ independent occurrences across separate tasks for general
   `taste`/domain conventions, 3+ for process/skill changes), drop a `proposed` root task in that project
   (or surface the proposal in the routine report when standalone) carrying the quoted evidence and exact
   proposed `.pipeline/rules/` or skill diff for human approval. Never edit rules or skills unattended.

## Target

$ARGUMENTS
