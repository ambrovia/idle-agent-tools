# Swarm Framework — Design Plan

*Version 0.4, 20 September 2026. Changes from 0.3 (Q&A Parts 16–20): tasks and decisions only, nothing extra; a tiny set of operations and a set of states; no stream concept — anyone drops a task; the system runs configured checks at submit; planner and planner are one role, the planner; the two layers defined.*

*Version 0.3, 18 September 2026. Derived from the design conversation. Changes from 0.2 (Q&A Part 12): a task is a goal, not a list of ACs — ACs stay but are weakened to signs of the goal, and done means the goal is reached; a stream is as big as the work needs; scope is the human's and human involvement grows with height in the tree; no gates — the human reopens; two layers — a standalone backend, and the existing pipeline skills adapted to it instead of seven new skills; cross-family review when possible; the L1/L2/L3 labels are replaced by plain names; ancestor goals in the brief.*

---

## 1. What this is

A task-and-decision backend that helps with the orchestration **around** existing harnesses (Claude Code, Codex, others). It is not a harness. It exists to make swarm work possible where meaningful coordination and efficiency toward a goal are otherwise not achievable with the tools we have.

Two layers.

**Pure idle** — the smallest useful thing, with nothing of ours on top:

- two entities, tasks and decisions; tasks nest, need each other, carry scope;
- four operations — `task`, `decision`, `show`, `list` — as a CLI and over MCP, and a set of states;
- anyone drops a task; search before create; claim as a lease, refused on overlapping scope;
- the system runs the project's configured checks when a task is submitted and resets it on failure;
- an optional review hold: a verified task waits for someone who did not do the work;
- two views: the brief a worker starts from, and the state of a whole tree;
- storage in the user's home — PGlite, or any Postgres they bring;
- one skill, `idle`, that says all of this. Bring your own workflow.

**Idle + agent-skills-pipeline** — our workflow on top, every part optional to someone else:

- how a dropped task becomes workable: the interview (`refine`, `program-design`) writing goal, plan, interview;
- how a tree is planned and run: `pipeline`, the planner's craft — goals not criteria, scope from the repo, integrate tasks, dispatch, surfacing for the human;
- how work is done and judged: `write-tests`, `write-code`, `write-docs`, `design`, `architecture`, `review`, `architecture-critique`;
- how it lands and what is learned: `ship`, `retro`, `compound`, `lore`;
- who does it: three personas — planner, builder, reviewer — generated per harness; hooks; `setup` and the repository's rules.

It is not a hands-off factory. It is a more flexible structure for work a human is still steering.

The goal for the first build is simplicity: something that does something in hours.

## 2. Principles

1. **Passive first.** The backend is a shared substrate that agents read and write. It launches nothing. Active behaviour, where needed, lives in an agent's instructions (an agent has a shell and can launch sessions on any harness) or in a scheduled routine, never in backend code.
2. **Work is the spine.** The substrate is a record of work. Decisions attach to it. Observations, later, attach around it. Artifacts live in git or wherever the environment keeps them.
3. **Goals, not criteria.** A task is a goal, described fully. It is done when that goal is reached, not when a list is ticked. Detail comes from nesting: child tasks are more detailed goals, and at the bottom they are as specific as an AC ever was. Agents that work to a checklist miss the bigger goal; the tree is what keeps it in view.
4. **The human owns scope.** How far we go, what we need to reach, and roughly how we get there are decided by the human in discussion with the planner. The higher in the tree, the more the human is involved. There are no gates: an agent says done, the human contradicts and reopens. The planner's job is to surface enough for that ping-pong.
5. **Routines, not loops.** Anything periodic is a scheduled routine in the harness itself (Claude Code scheduled tasks, Codex automations, cron), pointing at a setup prompt and skills. Minutes of latency is fine. The backend never holds a long-lived process.
6. **Sessions are short; the substrate is the memory.** No agent, including the planner, is trusted to remember anything across sessions. What isn't written into the substrate doesn't exist.
7. **No environment assumptions.** Nothing about git, branches, PRs, worktrees, containers, or policies. The backend gives space for such information and never requires or interprets it.
8. **No cost, no limits.** No token or spend tracking, no budgets, no retry caps. Other tools do that well.
9. **Hard budgets on prose.** Anything an agent writes into the substrate for other agents to read has a size cap enforced at write time.
10. **Conversation is the input, the substrate is the record.** Planning happens through interview with the planner. What persists is the curated result, not the transcript.
11. **One brain awake at a time.** A single planner plans every level of a stream. There are no sub-planners.

## 3. Model

Two entities. Everything else is a field or a convention.

### Task

The unit of work and the node of the DAG.

| Field | Meaning |
|---|---|
| id | Unique |
| title | Short |
| goal | What is true when this is done, and why it matters. The full description. This is the contract |
| acceptance_criteria | Optional. Signs that the goal is reached, written to sharpen the goal, not to replace it. All ACs passing while the goal is missed is a rejection |
| scope | Strings naming what this task touches (paths, modules, systems). Written by the planner. The substrate refuses an active claim whose scope overlaps another active claim in the same stream |
| status | proposed / ready / claimed / submitted / verified / in_review / done / rejected / blocked |
| parent | Task id, or none (none = root task = a stream) |
| references | Other task ids this depends on or builds on. This is the DAG |
| claimed_by / claimed_at / expires | Claim as fields, with expiry. `claimed_by` records harness, model, session |
| feedback | From the worker to the planner, capped: goal is wrong, approach won't work, conflicts with decision D-x, anything learned by doing |
| verdict | Why it came back, capped: a failed check, a reviewer's blocking findings, the human's reason on reopen. No other history or evidence is recorded (Q&A Part 16) |
| decision_refs | Decision ids this task is bound by |
| plan | The condensed, worker-facing plan. Always on the root; at any deeper level where needed. The root's plan and interview, and preferences learned in memory, guide where that is |
| interview | Curated Q&A from the planning interview. Not a transcript. Same placement as `plan` |
| consumer_scenario | Root tasks: how the result is used from the outside, written by the planner at planning time, before implementation |
| metadata | Free-form: branch, worktree, container, URLs. Stored and rendered, never interpreted |

Conventions, not kinds:

- **Anyone can drop a task at any time**, however unstructured; a title is enough. It starts as a single root task and may grow into a tree, as big as the work needs. There is no stream, track, work package, or size; whether a task is divided at all, how deep, and by how many agents is an active decision each time. The human can reopen a done task until it is archived. Archived means merged or abandoned — both visible from the repo, which is more truth than the task system. Nothing is rendered back.
- A **review** is a task whose goal says "review T-x with lens L". Nothing special about it.
- A **retro** is a task created when a root completes. It reads rejections, blocks, expired claims, feedback and superseded decisions from the substrate rather than reconstructing them.
- A **proposal** is a set of child tasks created in `proposed` status by a worker who found the task bigger than it looked, or whose task *was* to work out the shape (architecture). The planner accepts, edits, or rejects. Work that does not belong to this stream is proposed as a new root; only the human accepts a root.
- A **reconcile** or **integrate** task is a task whose goal says so, executed by an agent that is neither of the workers whose output it merges. If the environment has PRs and policies, the executing agent follows them as a human would.

### Decision

| Field | Meaning |
|---|---|
| id | Unique |
| statement | One line, capped |
| rationale | Short |
| task | Where it was made |
| by | Harness, model, session |
| status | active / superseded |
| superseded_by | Decision id |

Decisions can be made by anyone, including workers who hit something the plan didn't anticipate. Because all decisions are recorded, they are a review surface: the human can query decisions since a point in time and supersede those that went the wrong way; tasks referencing a superseded decision are flagged for re-plan.

### Observation — deferred

Observations already work today as inline comments (`@lore`). When added: hard character cap, subject as `kind:key`, fast worker write with slow separate curation, archival as a first-class operation.

## 4. Lifecycle

```
proposed → ready → claimed → submitted → verified → in_review → done
                       ↓          ↓ (checks fail)       ↓ (verdict fails)   ↓ (human reopens)
                    blocked    rejected → ready       rejected → ready     ready
```

- **ready**: all referenced tasks are done.
- **claimed**: one session holds it; the claim expires; an expired claim returns the task to ready.
- **submitted**: the worker says the goal is reached. A worker can never transition past this state.
- **verified**: a routine re-ran the checks and they passed. A task with no checks passes straight through.
- **in_review**: a review task exists and is not done.
- **done**: the reviewer judged the goal reached.
- **rejected**: reopens with the failing check or verdict attached so the next worker sees why.
- **reopened**: the human contradicts a `done`, through the planner; the reason lands in `feedback` and the task returns to `ready`. Reopening a parent does not reopen its children; the planner decides what new work it means.
- **blocked**: the worker stopped and said why in `feedback`. The planner handles it on its next wake.
- A task with children is done when all children are done and its own goal is reached, via an integrate task the planner creates when the last child completes. Children being done is not the same as the goal being reached — that gap is what the integrate task and its review exist to catch.
- A **root task** is done when the planner judges its goal covered by done work and the consumer-view task has passed.

Stream liveness is found by walking the DAG from active root tasks: a live planner holds an unexpired claim on the root.

## 5. Verification

Uniform for every task; no per-task level. Three steps, in the order they were described in the Q&A (Parts 3 and 10):

- **Checks — run by the system.** Workers say they ran the tests and didn't, so nobody's word counts, the planner's included. The checks are shell commands configured per project on the machine — part of the setup, never a field on a task. When a task is submitted the system runs them where the work is and, without any agent, moves the task on or resets it to open with the output. We own nothing about them: caching, baselines and flakiness are the verification system's business. This is a floor. Green checks do not mean the goal is reached.
- **Review — every task, fresh context.** Created automatically on `verified`. The reviewer judges whether the goal, in its full description and in the light of its ancestors' goals, is reached — not whether a list was satisfied. When more than one harness or model family is connected, the reviewer's differs from the implementer's, checked against `by`; when only one is, fresh context is what we get. One lens per review task.
- **Consumer view — root only.** When every child of the root is done, a routine creates the final validation task. A fresh reviewer uses the result as its consumer would, following `consumer_scenario`.

## 6. Work origin

The human decides what a stream is for and how far it goes. Under that, the planner creates tasks at every level; workers propose. A worker that finds its task too large returns it with proposed children rather than splitting in place. Creating a task or a decision shows the creator the nearest existing ones before it commits (search before create).

## 7. Roles

Roles are agent instruction files, not backend code.

**Planner.** Single per stream, and the agent the human talks to. Strongest available reasoning model, because it holds the whole picture. The human follows it: deep where it dives deep, shallow where it stays shallow. Two session types:

- *Interview session.* Started by the human. Runs the interview, writes plan, Q&A, the root goal, and the consumer scenario. Can happen again lower in the tree wherever a goal needs the human.
- *Planning session.* Started by keepalive on a cadence, or by the human to steer. Reads the rendered root state. Handles the batch: creates tasks with goal and scope, accepts or rejects proposals, creates reconcile and integrate tasks, supersedes decisions, reopens what the human contradicted, appends to the Q&A if the human steered. Exits. Its claim on the root has a short expiry.

Three rules in the planner's instructions:
1. Make design decisions yourself rather than delegating them; no two tasks may decide the same question.
2. Before decomposing, ask whether a single session would plausibly do the whole thing. If yes, create one task.
3. Re-read the substrate before every planning move. Never trust the transcript.

**Worker.** Reads the brief, claims, executes in whatever isolation the environment gives, records decisions it had to make, writes feedback for anything learned by doing, submits with evidence, or returns with proposed children, or blocks with a reason.

**Reviewer.** Executes review tasks and the root's consumer-view task. Checks its own independence against the implementer's `by` where independence is available.

Steering always goes through the planner. Workers never see the interview; they see their task, the plan, and the decisions in scope.

## 8. Worker brief

Rendered from the substrate at launch. Everything meaningful up front; the rest on demand.

- Task goal, acceptance criteria if any, checks, scope
- The chain of ancestor goals up to the root, one line each — what this task is *for*
- Current plan (nearest one up the tree)
- Active decisions in scope
- Titles and goals of referenced tasks
- On a re-entry: why it was rejected or reopened
- (Later: promoted observations)

## 9. Renders

- **Brief** for a task (above).
- **Root state** for an planner wake and for the human's ping-pong: plan, Q&A, the tree with status, what was marked done since last wake and on what evidence, open proposals, blocked tasks with feedback, feedback on active tasks, decisions since last wake, carried-forward review notes.
- **Decisions since T** for human review.
- **Active claims and scopes** in a stream.

## 10. Where it lands

**Backend** — usable without anything else in this repo:

| Piece | Purpose |
|---|---|
| storage + interface | Tasks and decisions; atomic claim with scope check; search before create; size caps at write time; renders |
| `substrate` skill | How any agent reads and writes it: claim, release, submit with evidence, feedback, block, propose, decide, transitions, renders. Workflow-neutral. The only skill an outside user needs |
| keepalive routine prompt | Expire stale claims, recompute ready, re-run checks for submitted tasks, create review / integrate / consumer-view / retro tasks, wake an planner if a stream has events and no live one |
| launch recipes | Per harness: start a detached session with a brief attached |

**Our workflow** — existing skills, adapted (detail in `repo-mapping.md`):

| Skill | Becomes |
|---|---|
| `pipeline` | The planner's craft, in short sessions over the root-state render |
| `work-planning` | Opens a stream: creates a root task with the human |
| `refine`, `program-design` | The interview; write `interview`, `plan`, goal, `consumer_scenario` |
| `architecture` | A task whose deliverable is proposed children with scope, plus decisions |
| `write-tests`, `write-code`, `write-docs` | The worker's craft: brief, claim, execute, decide, feedback, submit or propose or block |
| `review`, `architecture-critique` | Execute review tasks; verdict against the goal |
| `ship` | An integrate task in environments that have PRs and CI |
| `retro` | A task at root completion, read from the substrate; `compound` reads across roots |
| `design`, `lore`, `setup` | Unchanged |

## 11. Routines

Scheduled runs in the harness. Each has a setup prompt that loads `substrate` and the keepalive prompt. Idempotent. Every step is a substrate query followed by at most one action.

## 12. Deferred decisions

- ~~Storage~~ — decided (Q&A Part 14): Postgres dialect everywhere. PGlite locally, any Postgres the user brings when shared. No server of our own. Detail in `storage-interface-research.md` §4.
- ~~Interface~~ — decided: one npm package, CLI as the base and MCP over the same core; shipped through the existing plugin.
- **Observations.**
- **Active drivers** on top of the passive substrate, if they ever earn their place.

## 13. First build

On this branch. Task, Decision, the `substrate` skill, minimal keepalive (expire claims, re-run checks, wake planner), one launch recipe; then adapt `pipeline`, `work-planning`, the interview skills and `write-code` to it. Re-run checks only, no review tasks yet. Run one real stream and find out where the model is wrong.
