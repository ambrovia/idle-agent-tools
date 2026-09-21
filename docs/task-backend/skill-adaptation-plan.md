# Skills — adaptation plan

*19 September 2026. How the existing skills, personas and hooks change to work on the backend. Companion to `backend-program-plan.md`; evidence in `repo-mapping.md`. This plans the edits; it does not make them. Edits follow the house style: terse, instructional, in each file's own voice.*

## Status

Stage A skill and persona edits are done (20 September 2026): the new `idle` skill, `work-planning`, `refine`, `program-design`, `pipeline`, `write-code`, `write-tests`, `write-docs`, `review`, `architecture`, `architecture-critique`, `design`, `ship`, `retro`, `compound`, `lore`, `setup`, the three personas and their generated copies, and the session-start message.

Done afterwards, with the plugin wiring (21 September 2026): `hooks/inject.mjs` reads the record of work through the `idle` CLI — the most recently touched unfinished root, its state, the diff since the commit recorded on the root as `since` — and keeps its check cache outside the repository; `scripts/pipeline-snapshot.mjs` and its test are deleted; the installers and the package file list no longer carry it; the `README` describes the two plugins.

Changed again by Q&A Part 20: `work-planning` is deleted — anyone drops a task, and `refine` carries the is-it-worth-doing test; there is no stream, only tasks and trees; the planner no longer runs checks — the system does, at submit, from the machine's configured commands; arbiter and planner are one role and one persona, so no new arbiter persona is needed in stage B. Rows below that say otherwise are superseded.

Two things the edits settled that the table below did not say: `plan` has two halves only — `## What we need` and `## How it works`; the old "how we work on this" is the tree itself. And in stage A the arbiter re-runs a submitted task's checks itself; keepalive takes that over in stage B.

## The five rules of the rewrite

1. **One skill knows the backend.** A new skill (working name `idle`) is the only place that says how to call it — operations, the lifecycle, what each role may do, the launch recipes, the keepalive prompt. It is workflow-neutral and is all an outside user needs. Every other skill names the *act* — "record the decision", "write feedback", "submit with evidence" — and never a command or a file path.
2. **No skill names a state file any more.** `.pipeline/work/<id>/`, `plan.md` sections, `progress.json`, `review.md`, `architecture.md`, `retro.jsonl`, the track files — all gone. What stays on disk: `pipeline.config.yml`, `.pipeline/rules/`, `.pipeline/compound-candidates.md`. Artifacts too large for a field (a design surface, a probe script) live in the work tree and are pointed to from the task.
3. **One order of authority, stated the same way everywhere:** the goal, read with its ancestors' goals → the nearest plan → decisions in scope → acceptance criteria, as signs of the goal → checks, as a floor. Wherever a skill says "satisfies its ACs" today, it says "reaches the goal".
4. **The human owns scope and reopens; there are no gates.** "Agree the gates" becomes "surface what was done and on what evidence". `awaiting-human-review` disappears as a state. The rule that survives: never absorb a new outcome silently — propose a root.
5. **What worked stays word for word.** The interview craft, the brief discipline, the finding taxonomy, end-to-end evidence through the real consuming path, the builder's habits, `lore`, `setup`, `design`'s viewer.

## Three stages

The pipeline keeps working at every stage; each is shippable on the branch.

**A — swap the memory.** The orchestrator still spawns builder and reviewer inside its own session, exactly as today. Only where state lives changes: the brief comes from the backend's render, feedback and decisions are written to it, the plan is a field. Needs backend steps 0–3. This is the first real stream run on the backend.

**B — let go of the session.** The arbiter may create tasks and exit; detached workers claim them; keepalive re-runs checks and wakes the arbiter. In-session spawning stays as the choice for small streams — arbiter rule 2 decides. Needs backend step 4 and the launch recipes.

**C — close the loop.** Review as tasks on every task, the consumer-view task at the root, retro as a task, `compound` reading across roots.

## File by file

| File | Stage | What changes |
|---|---|---|
| `skills/idle` (new) | A | Written from the backend's own help text. Sections: what a task, a stream and a decision are; the states and the allowed moves in one diagram; the four operations; which moves belong to which role; launch recipes; the keepalive prompt. No mention of any other skill. |
| `work-planning` | A | Opens a stream instead of registering an item. Keeps the value test, existing-behaviour → missing delta, stop-without-creating, human-only. Drops tracks, item ids, the dial estimate, the five-heading seed, the commit step. Writes: root title, goal seed, `checks` from `{{verify}}`. |
| `refine` | A | Unchanged in craft. Output changes: the curated Q&A goes to `interview`, the condensed result to `plan`, "what success looks like" becomes the root goal and feeds `consumer_scenario`. One new paragraph: the root's plan and interview, and learned preferences, say at which deeper tasks to interview again. |
| `program-design` | A | Same. Writes the how-it-works half of `plan`. The 50–100 line budget stays and is now enforced by the backend. |
| `pipeline` | A, then B | The largest rewrite; becomes the arbiter's craft. **Goes:** the plan-sections table, dials, gates, State, Isolation (one line survives: task ids never appear in branch, commit or PR text), the review-depth table, "never end a turn without a tool call". **Stays:** spawn to keep work out of your context; the brief discipline; fan out only for homogeneous work; same-reason failure → stop and take it to the human; when the plan changes, decide in-flight work with them. **New:** the three arbiter rules; read the root state before every move; decompose into goals with scope, deriving scope from the repo; handle feedback, proposals and blocked tasks; create integrate tasks when a parent's children are done — children done is not the goal reached; out-of-stream work is a proposed root. Stage B adds: create-and-exit, short sessions, the root claim as liveness. |
| `write-code`, `write-tests`, `write-docs` | A | Reading list becomes "the brief". Rule 3's authority order replaces AC language; `write-tests` loses the AC-to-evidence map and "cover every AC". New closing section shared by all three: decide and record it; write feedback for what you learned by doing; finish by submitting with evidence, proposing children, or blocking with a reason. Commit-per-boundary, run-once-and-wait, never-weaken-a-test stay verbatim. |
| `review` | A, then C | Verdict against the goal, not an AC table. Taxonomy, authority-per-finding, scope excess, end-to-end evidence, carry-forward of non-blocking notes stay verbatim. Output is a verdict on the subject task, not `review.md`. Stage C: it is a claimed task like any other; checks its independence against the implementer's `by` — different family when one is connected, fresh context otherwise; lens comes from the task. |
| `architecture` | A | Same craft, different deliverable: proposed child tasks — each a more detailed goal with scope derived from the repo — plus decisions for every locked choice. No `architecture.md`. The named end-to-end evidence becomes the goal of the integrate task. Feasibility probes are their own tasks; results are evidence. |
| `architecture-critique` | A | Reviews the proposal before the arbiter accepts it: do the children cover the parent's goal without adding outcomes. Fact-audit rule stays verbatim. |
| `design` | A | Craft and viewer untouched. Binding UX decisions are recorded as decisions; the surface stays in the work tree, pointed to from the task. |
| `ship` | A | Loses the whole consolidation step — the repo is the truth, nothing is folded back. Keeps staging discipline, verify-from-clean, PR, CI wait. Is the craft for an integrate task where the environment has PRs. |
| `retro` | A, then C | Reads what the backend keeps — each task's `feedback` and `verdict`, blocked tasks, superseded decisions — instead of reconstructing it; the backend records no other history, so the rest still comes from VCS and trajectories. Writes its observations to the root's `feedback`, not `retro.jsonl`. `divergence` = what the human reopened or superseded. Stage C: created as a task when a root completes. |
| `compound` | C | Reads retro entries across roots. Tracker file and propose-never-apply unchanged. |
| `lore`, `setup` | — | Unchanged. `setup` needs no new step: the backend has no init. |
| `personas/pipeline-builder`, `-reviewer`, `-planner` | A | Authority paragraphs take rule 3. "Your report is your only channel" becomes: write it to the task, and say it in the report. Reviewer's first blocking ground becomes "the goal is not reached, or not shown to be". Planner narrows to the worker that takes architecture and design tasks; it proposes, never creates. |
| `personas/arbiter` (new) | B | For a detached arbiter session: the three rules, strongest model, never implements. In stage A the orchestrator session with `pipeline` loaded *is* the arbiter and needs no persona. |
| `hooks/inject.mjs` | A | Injects the backend's brief or root state instead of the snapshot digest. Per-host length caps and "a spawn must never break" stay. |
| `scripts/pipeline-snapshot.mjs` + test | A | Deleted; the renders replace it. |
| `hooks/session-start.sh` | A | Message names the new entry points. |
| `edit-streak.sh`, `thrash-detector.mjs` | — | Unchanged. A claim-renewing hook is a stage B candidate. |
| `README`, manifests, version | end of A | Rewritten once stage A works; a breaking release. |

## Adopting what exists

A repository with `.pipeline/work/<id>/plan.md` items is not blocked. `pipeline` keeps its adoption clause in new words: open a stream from the old plan — `What we need` and `How it works` become the plan, the title and first paragraph the goal — and carry on. No migration tool.

## How we know it worked

The skills have no tests and won't get any. The proof is real runs: `/pipeline` on a throwaway repository with a real `npm test`, checks and review switched on, the task dropped as a bare title, the maintainer's interview answers given up front (headless, so nobody to ask). Three were run on 21 September 2026, and each was judged from the record and the repository, not from the agent's summary.

| Run | Shape | What the record showed |
|---|---|---|
| 1 | one small bugfix | title → goal, plan, interview, scenario; kept as one task; builder and reviewer under distinct identities; system ran the checks at submit; reviewer passed; one clean commit, no task id in git; retro written |
| 2 | two independent helpers + an integrate task | tree of three children, scopes that do not overlap, `needs` on the integrate task, 21 tests, everything working through the one entry point |
| 3 | a dependency, and a choice left open on purpose | the builder's choice recorded as a decision and superseded twice as it was refined; a real rejection loop — the reviewer sent the task back for tests that could not fail *and for code that contradicted the recorded decision* — then passed it |

What the runs found, none of which paper review or unit tests could have: reviewers leaving a passed task at `verified` instead of moving it to `done`, which stalled everything that needed it (the wording "it is done" read as a statement); a real builder choice written into feedback instead of a decision; a builder blocking a task that was merely not ready; entries carrying the writer's name twice; and the three Claude personas having no MCP tools at all — their `tools` line is an allowlist — so they reached the record only through the `idle` command in Bash. All fixed; run 3 confirmed the first three.

Not yet run: another harness than Claude Code, a live human in the interview, a stream large enough to need detached workers, a shared database.
