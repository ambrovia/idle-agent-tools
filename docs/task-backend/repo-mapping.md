# Repo analysis — agent-skills-pipeline against the swarm plan

*18 September 2026. Step 1 of the handover README. Read: all 16 skills, the 3 personas, `agents/README.md`, the hooks, `pipeline-snapshot.mjs`, `pipeline.config.example.yml`. Written against plan v0.2; section 3 was answered in Q&A Part 12 and folded into plan v0.3. Section 2 stands, read with one correction: the "lands in" column names the plan-v0.2 skill a learning belongs to — per Part 12 those are not new skills, the existing skill is adapted in place and only `substrate` is new.*

## 1. The short version

The pipeline already is the swarm model, run by one live orchestrator over files. `progress.json` + `.pipeline/<track>.md` + `plan.md` are a hand-rolled substrate; the orchestrator is a long-lived arbiter; builder/reviewer spawns are workers with rendered briefs. What changes is where state lives and who is awake — not the craft. Most of the craft carries.

| Pipeline today | Swarm plan |
|---|---|
| `.pipeline/work/<id>/progress.json`, `.pipeline/<track>.md` dependency graph | Task entity, `references`, `status` |
| `plan.md` — `What we need` / `How it works` / `How we work on this` | root `plan` (+ `interview`, which the pipeline never persisted) |
| `plan.md` — `## Confusions` | `feedback` |
| `plan.md` — `## Proposed items` | no equivalent — see 3.1 |
| Builder "pick the option you can defend, say which and why" | Decision made by a worker |
| Builder "plan contradicts reality → raise a blocker"; "three fixes and stop" | `blocked` + `feedback` |
| Owned paths for parallel leaves | `scope` |
| `checks.preSpawn` injected at spawn, "judge them, re-run only when disputing" | L1 routine re-run, actual outcomes attached at `verified` |
| Fresh `pipeline-reviewer`, read-only, never repairs | L2 review task |
| Gate before ship, maintainer sees the surface | closest thing to L3 — see 3.2 |
| `pipeline-snapshot.mjs` + `inject.mjs` (state digest at SubagentStart / skill load) | brief and root-state renders, and their delivery |
| `@lore` | Observation, v0 ("inline comments work today") |
| `personas/` → `generate-agents.mjs` → 4 harness dialects | "roles are agents.md" — already single-sourced |
| `model: opus` planner/reviewer, `sonnet` builder | P28 tiering |

## 2. Skill by skill

**Carries** = prose moves nearly verbatim. **Rewrite** = same learning, new shape. **Outside** = environment-side, stays as it is next to the framework.

| Existing | Lands in | Verdict | What carries / what changes |
|---|---|---|---|
| `pipeline` | `stream` | rewrite | Carries: plan is authoritative and budgeted (50–100 lines, per-section owner); never absorb a new outcome silently; "spawn to keep work out of your context, not because it feels like someone else's job"; brief = id, role, exact reading list, output contract, retry gets only blocking findings + delta, stable content first; fan out only for homogeneous work; same-reason failure → stop attempting; precise states with "smallest action needed to resume"; "written state must let a cold agent resume". Changes: the live orchestrator loop ("never end a turn without a tool call") becomes short planning sessions; dispatch-and-wait becomes create-task-and-exit; Isolation section leaves (principle 5) except "IDs never leak into VCS metadata", which becomes a `work` rule. |
| `work-planning` | `stream` (root creation) | rewrite | Carries: value test, existing behaviour → missing delta (search-before-create at root level), "a dependency is only what makes this impossible before that is done", never register research as the deliverable, stop-without-registering list, maintainer-only. Changes: seed → root `spec`; track file → `references` between roots. |
| `refine` | `stream` (interview session) | carries | The interview craft is the most valuable prose in the repo and matches Q&A Part 6 exactly: rounds of numbered questions each with a recommended answer; facts are your job, decisions are theirs; taste is only what they tell you here; stop at confirmation; write it in their words. Changes: output is `interview` (curated Q&A) **and** `plan`; adds root ACs and `l3_scenario` as outputs. |
| `program-design` | `stream` (interview session) | carries | "Plain words only — if it could not be said out loud it belongs in architecture"; ambiguity decides, not size; a bad planner result is a bad brief. |
| `architecture` | a task convention, specified in `stream`; craft in `work` | rewrite | Reconciles "no sub-planners" with a clean arbiter context: an *architecture task* is worked by a strong-model worker whose deliverable is **proposed children with scope + Decisions** — workers propose, arbiter disposes. Carries: prefer one task, split only at a real dependency or safe parallel boundary (= arbiter rule 2); lock irreversible/public/costly choices (→ Decisions), leave reversible ones to the worker; verify every named symbol exists; **derive consumers from the repo, specs undercount** (this is how `scope` strings must be produced); name the one piece of end-to-end evidence (→ integrate-task AC / L3); feasibility probe → its own task, `UNVERIFIED` marker. |
| `architecture-critique` | `review` | carries | L2 applies to planning artifacts too. Fact-audit load-bearing claims with `file:line` or `UNVERIFIED`; block-only-when list; "where technical vocabulary has quietly decided how the program works, that decision escaped the maintainer". |
| `design` (+ viewer) | a task convention + a human gate | outside / carries | Viewer tooling unchanged. The approval is a gate (3.2). |
| `write-tests` | `work` | carries | Red before green; tests prove requirements, never create them; "each test earns its place by being able to fail for a reason someone would care about". Feeds 3.4. |
| `write-code` | `work` | carries | Smallest repository-native solution; commit at each task boundary so an interrupted claim strands nothing; run each check once and wait; never weaken a test; owned paths only; report pre-existing failures separately. |
| `write-docs` | `work` | carries | Task convention. |
| `review` | `review` | carries | Finding taxonomy (BLOCKING / NON-BLOCKING DEFECT / NOTE); every finding cites location, evidence, impact, governing authority; only blocking goes back; non-blocking carried forward verbatim and never promoted; scope excess blocks as hard as under-delivery; "units green while the wired path is broken is the classic false green"; on retry read previous verdict + delta, carry unchanged PASS. Changes: "depth is assigned, not chosen" → lens is in the review task's spec; adds the `by` independence check. |
| — | `consume` | new | Nothing to carry except review's real-consuming-path paragraph and design's "show the surface, not prose about it". |
| `ship` | a task convention (integrate/ship) | outside | Environment-specific by principle 5. Carries into `stream`: consolidation is editorial, not archival; "a deferral recorded only in a deleted artifact is a deferral nobody will ever act on" (3.6). CI: three failed attempts → `blocked`. |
| `retro`, `compound` | not in plan | gap — 3.7 | |
| `lore` | Observation v0 | carries | Capture test, telegraphic style, "delete stale lore", reject chronology = the char cap and archival rules the Q&A already asked for. No work needed until observations are un-deferred. |
| `setup`, `pipeline.config.yml`, rule slots | environment config | outside | `verify` is the natural default AC command for integrate tasks and roots. `checks.preSpawn` is superseded by the L1 routine. Brief must *point at* applicable rule files (3.8). |
| personas + `generate-agents.mjs` | roles | carries | Add an `arbiter` persona; builder → worker; reviewer stays; planner splits into arbiter (interview, decompose) and the strong-model worker that takes architecture tasks. The "your report is your only channel" closing paragraph becomes "the substrate is your only channel". |
| `inject.mjs`, `pipeline-snapshot.mjs` | `substrate` renders, `launch` | rewrite | Snapshot is the prototype of both renders. Carries: per-host line caps (Codex truncates ~1k tokens → pointers not contents), "a spawn must never break — degrade to silence", results stamped with the tree they ran on. The per-harness notes in `agents/README.md` and the install scripts are the raw material for `launch` recipes. |
| `edit-streak.sh` | arbiter persona | carries | "Arbiter never implements", enforced mechanically. |
| `thrash-detector.mjs` | `work` | carries | Mechanical form of three-fixes-and-stop → `blocked`. |

## 3. What file-based planning taught — and what happened to it

Raised against v0.2, answered in Q&A Part 12.

| Raised | Outcome |
|---|---|
| Scope authority — the orchestrator never creates outcomes | **In v0.3.** The human owns scope, in discussion with the arbiter; more human the higher in the tree. Work outside the stream is proposed as a new root, which only the human accepts. |
| Human gates | **Dropped.** No gates. The agent says done, the human contradicts and reopens. What the pipeline's gate rules become: the root-state render has to show enough for that — what was marked done and on what evidence. "Reopen" is a transition. |
| Same-reason rejection cap | **Dropped.** Endless cycles are not a real failure mode here. |
| ACs that are not commands | **Dissolved.** The system is not built on ACs any more. A task is a goal; nesting supplies the detail; `checks` are an optional floor; the reviewer judges the goal. |
| Track vs item size | **Dropped.** A stream is as big as the work needs. Tracks, item IDs-by-track, and the complexity dial go. |
| Retro / compound | **In v0.3.** Retro is a task at root completion, read from the substrate. Compound stays a capability across roots. |
| Cross-family review | **In v0.3** as do-if-possible. |
| Side by side or in place | **In place, on this branch.** Backend is standalone; existing skills adapt to it. |

Closed in Part 13: a green-before-work baseline (we re-run what the setup gives us and own nothing about the verification system) and rendering back at archive (the repo is more truth than the task system).

Still open — small, neither blocks storage:

- **Project rules in the brief.** One line: the brief points at the environment's rule files that apply to the task's scope.
- **Plan changes with work in flight.** Claims record the plan version; root state lists claims older than the current plan. The pipeline's rule carries: decide it with the human, never silently continue, never discard wholesale.

## 4. What the goal-not-AC shift does to the existing skills

This is the largest rewrite the mapping did not anticipate. ACs stay as a word (Part 13) but lose their authority: everywhere below, the goal becomes the contract and ACs become signs of it. AC language is load-bearing in most of the repo:

| Where | Today | Becomes |
|---|---|---|
| `review` | "For every plan AC record PASS or FAIL"; AC table in `review.md`; `DONE` only when all ACs pass | Judge whether the goal is reached, reading it with its ancestors' goals. Evidence per claim the task makes, not per AC. The end-to-end-evidence paragraph and the finding taxonomy stay as they are. |
| reviewer persona | Blocking = "a failed or unproven plan AC" | Blocking = the goal is not reached, or not shown to be. The other four authorities stay. |
| `write-tests` | "Cover every AC and stop there"; AC-to-evidence map | Tests for the behaviour the goal names, where a test can fail for a reason someone would care about. The map goes; `checks` on the task is what remains of it. |
| `write-code`, builder persona | "smallest solution that satisfies its ACs" | "…that reaches the goal". Test-first stays. |
| `architecture` | "AC-to-implementation obligation mapping"; traces every obligation to an AC | Proposes child tasks — each a more detailed goal. The decomposition *is* the obligation mapping. |
| `architecture-critique` | "traces obligations to ACs without adding outcomes" | "children cover the parent's goal without adding outcomes". |
| `work-planning` | "Write no acceptance criteria" in the seed | Already right; writes the root goal. |
| `refine` | "what success looks like, concretely enough to tell later whether it happened" | Already right — this *is* a goal. Also feeds `consumer_scenario`. |
| `pipeline` dials | complexity · ambiguity · exposure | Complexity goes (the tree's shape is the answer). Ambiguity and exposure stay as the arbiter's judgement on how long to interview and how many review lenses — not fields. |

What keeps the bigger goal in view mechanically is one line in the brief: the chain of ancestor goals. Added to plan v0.3 §8.
