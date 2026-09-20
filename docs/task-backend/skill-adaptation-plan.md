# Skills — adaptation plan

*19 September 2026. How the existing skills, personas and hooks change to work on the backend. Companion to `backend-program-plan.md`; evidence in `repo-mapping.md`. This plans the edits; it does not make them. Edits follow the house style: terse, instructional, in each file's own voice.*

## Status

Stage A skill and persona edits are done (20 September 2026): the new `idle` skill, `work-planning`, `refine`, `program-design`, `pipeline`, `write-code`, `write-tests`, `write-docs`, `review`, `architecture`, `architecture-critique`, `design`, `ship`, `retro`, `compound`, `lore`, `setup`, the three personas and their generated copies, and the session-start message.

Moved out of stage A, to be done together with shipping the backend inside the plugin (backend step 6), because all of it is one question — how `tasks/` reaches an installed plugin: `hooks/inject.mjs` reading the record instead of `.pipeline/work/`, deleting `scripts/pipeline-snapshot.mjs` and its test, the three installers and the package file list that carry it. Until then the hook finds no work folder and stays silent, and the skills' own fallback applies: the arbiter puts the brief in the spawn prompt. `README` follows once one real stream has run.

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

The skills have no tests and won't get any. The proof is one real stream: stage A itself, run on backend steps 0–3, with a retro at the end. Where an agent chases an acceptance criterion past the goal, or the human cannot tell from the root state what to contradict, the model is wrong there and the Q&A gets a new part.
