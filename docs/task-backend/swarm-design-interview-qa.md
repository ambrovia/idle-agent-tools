# Swarm Framework — Design Interview Q&A

*The curated question-and-answer record of the design conversation, 13–17 September 2026. This is the primary artifact: the same kind of Q&A the framework's arbiter is meant to persist for a stream. Questions were asked by the assistant (A→T) or by Tobi (T→A). Answers are kept close to the original wording. Supporting research is in `swarm-operations-patterns.md`; the resulting plan is in `swarm-framework-plan.md`.*

---

## Part 1 — Framing

**Q (A→T): What should the tooling incorporate, and how do we make it most useful? [Assistant produced a full design sketch: control loop, two planes, framework-owned worktrees, hierarchical merge branches, scheduler, watchdog, module layout.]**

A: I'm not sure we are building a control loop. You are already too deep and have too many assumptions taken that need discussion. Back out five levels; we discuss interview-style, from basics on.

**Q (A→T): When you last ran more than one agent, what did that look like step by step, and where did it get annoying?**

A: Wrong question. We are designing for a scenario that is simply not possible without such a framework. I tried other coordination pieces but nothing like this. I know from simpler setups that some things just don't work, but what we are working towards isn't possible without this.

**Q (A→T): Describe the target scenario as if it already worked — task, duration, agents alive at once, output, what you do meanwhile?**

A: Working in swarms with meaningful coordination and improved efficiency to goal. Your research tells you the goal. We are here to discuss a program plan, not the basics of why we are doing this.

**Q (T→A): What are the core aspects?**

A (T, stated): We are not building a harness. We are building a framework — whatever that means — that helps with the orchestration around the harness.

---

## Part 2 — Fundamental shape

**Q (A→T): What is the relationship between the framework and a running harness? Active (framework launches, feeds, watches, stops harnesses), passive (shared substrate that harnesses read and write; anything can launch a harness), or mixed?**

A: The goal is simplicity. We never tried this, so we need a solution that does something in hours. Active means interfaces to multiple harnesses; that alone is a lot of complexity. I tend towards mixed with passive first; we can add active when needed and valuable.

**Q (A→T): Shell CLI or MCP server as the agent-facing interface, and which harness on day one?**

A: Doesn't matter. That's an implementation detail once we know how our system works.

**Q (A→T): What is the substrate fundamentally a record of — work (task graph), decisions (a log everything references), observations (a shared board), or artifacts (a registry)? One is the spine.**

A: I would assume work is the substrate. Decisions and observations are attached to that, or around that, in a light form. Artifacts is mostly git or something similar.

**Q (A→T): Where does work come from — humans only, any agent, or designated planners? And can a claimed task be split, or is splitting a separate step?**

A: Hmm, what does the research say? This is not a blunt interview on me. This is about discussing the aspects and options, with trade-offs from the research.

**Q (A→T, restated with research): Humans-only compounds spec failures (MAST 41.8%) and couldn't have produced FLT's 30,000-node graph. Any-agent works in Prove2Me only because adding a node is separate from working on one and every node is searchable; without that, Cursor's 54-crate sprawl and 17.2× error amplification. Designated planners is Cursor's July result but rigid alone. Proposal: planners spawn, workers propose; return-and-re-plan rather than split in place; search before create. Does "workers propose, planners dispose" sit right?**

A: Yeah, that makes sense.

---

## Part 3 — Verification

**Q (A→T): What does "done" mean — self-declared, evidence-gated (command re-run), or review-gated (fresh reviewer)? Should the framework re-run evidence itself, and is a verdict binary or a score plus disagreement?**

A: To me there are three aspects of verification. First, that the goal is reached — the acceptance criteria are built as features and tests, as said by the implementing agent. Second, review by an independent and fresh agent, with verdicts approved. Third, manual testing / using by a separate agent (can be the reviewer) which really takes the user's / consumer's view. But not every atomic task needs every level of verification. As long as possible I would go with routines rather than being active. Worst case the system sleeps for a few minutes.

---

## Part 4 — Decisions

**Q (A→T): Decisions "in a light form" — free-text notes on tasks, or referenceable records with IDs that downstream work cites and a routine lints?**

A: Yeah, I guess decisions should be searchable. So they are an entity. I wouldn't settle on "table" yet since we haven't decided storage, but they should be searchable entities.

---

## Part 5 — The arbiter

**Q (A→T): Is the arbiter a long-lived session or stateless per wake? Is "arbiter = root-scope planner routine" your picture, or something categorically different from a planner?**

A: The arbiter is something like a stream / root-work-level planner which is actively started per stream by the human and has the context of the stream. The routines are more for getting work started, where the arbiter doesn't have direct access at the harness level and, for our passive start version, cannot directly start the work. Though thinking about it, the arbiter as an agent should be able to launch a session on another harness via CLI. Then routines are more keep-alive mechanisms.

**Q (A→T): Should the worker's rendered context be minimal by default with siblings and field guide pulled on demand, or everything injected up front?**

A: Everything meaningful injected — but some file reads or CLI/MCP calls happen anyhow. Which again is the interface we haven't defined; that's for later.

---

## Part 6 — Environment boundary

**Q (A→T): How does work flow back together — flat PRs into main, hierarchical integration branches mirroring the stream, or orthogonality by file ownership; and does the arbiter merge the stream into main itself or is that the human's signature?**

A: That's the thing: PRs and git are not something that we own with this framework. Git and PR setup depends on the repo or folder or whatever we work on. Git and similar is a separate setup that we cannot assume works as we need, or is there at all.

**Q (A→T): Then artifacts are opaque references, integration is just work, claim scope stays as arbitrary strings, isolation is the harness's job. For the human's channel: a steering entity in the substrate so a restarted arbiter and workers don't lose it — is that enough, or should the human be able to steer without an arbiter session at all?**

A: We record session id, branch, worktree and whatever is there — we give space for this information but don't require it. And yeah, the arbiter losing direction is a common issue, so having a steering entity in the substrate makes sense: something deterministic that doesn't lose steering. A valuable learning I made, however, is that an interview-like conversation is often the better plan than a written plan. So the arbiter as an agent also plays a relevant role. But yeah, steering will probably always go through an arbiter agent. Workers, similar to what Cursor learned, should not read the full steering — that's a lot of prose.

**Q (A→T): [Assistant proposed: conversation is the input, substrate is the record; two tiers by audience — steering entries arbiter-facing, decisions worker-facing.]**

A: A plan is typically still necessary; that's the condensed version for the workers alongside their specific task. Also, not everything spoken to the arbiter needs to be persisted, only where we actually interview and plan about what this stream is about. The conversation will have other, not relevant pieces not worth keeping. It's a question-answer style list, not memory, but it's not the full conversation. Decisions can happen anywhere — a worker might have to decide something we didn't anticipate. By the fact that all decisions are recorded we can also review them and steer against those that went the wrong way.

---

## Part 7 — Observations

**Q (T→A): What are observations, first off?**

A (assistant): Something an agent learned about the environment or the work while doing a task that is not the task's output, not a decision, not evidence, and not steering. Environment facts ("the build takes 40 seconds"), findings, and descriptions of work so others can find and reuse it. Light versions: node-attached notes; curated shared guide (Cursor); structured world model (Kosmos). Proposed: any agent writes, a subset gets promoted into a line-budgeted stream guide.

**Q (A→T): Who promotes — the arbiter only, or the worker who found it?**

A: Observations clearly need a line or character budget. Unless agents are forced to describe it in 200 chars or 3 lines they will write an essay. Attached to the task I'm not sure how helpful this is; those observations are quickly forgotten unless really specific to the task. Some observations will be regarding a file or a system, so what an observation attaches to needs to be relatively free — just structured enough that we avoid hidden duplication. Those relevant to a task still attach to that task. Workers promoting is fine, but we probably need some sort of slower curation afterwards as well. Workers think fast; something — maybe the arbiter, maybe a separate routine agent — needs to curate slowly but correctly. Also an important part is forgetting: if the task is done or the file is gone, the observation should be archived; and if workers identify wrong facts they should be able to archive or mark for archival. In the end, sounds like observations are their own thing next to tasks and decisions?

**Q (A→T): [Assistant confirmed: third entity, char cap, subject as kind:key, fast write / slow curation, archival first-class, provenance.] Next: limits and budgets, and how a stream ends — take those first or go straight to the plan?**

A: What is the question?

**Q (A→T): Limits — what does the framework enforce vs only record (refuse claims when over budget, or purely descriptive)? Stream end — what is the terminal condition and who declares it (root reaches done, arbiter declares, human closes)?**

A: We don't care about token spends or recordings. We don't build limits into our system. Stream ends when the arbiter says it's done — but obviously the human can counter the arbiter until it's archived.

**Q (A→T): [Assistant's plan draft still said "descriptive on cost".]**

A: We don't even track cost. Other tools are great at tracking cost.

---

## Part 8 — Pushback on the entity draft

**Q (A→T): [Assistant presented a plan with entities Stream, Node (with kinds, proposals slot), Claim, Decision, Observation, Steering entry; an operations list; roles; framework routines; hours-to-something cut.]**

A: So that looks like everything is one graph? Not sure that's right. Why did we end up at this shape after all our discussions? Node is so many things at once with stuff that crept in there we never talked about and that doesn't even mean anything to me. Why is the claim an extra object and not just a field? So really we have Tasks, Decisions, Observations. And realistically observations are something we can delay till later, since observations already work today as inline comments. So we are down to Tasks and Decisions, where Tasks are nodes that can reference other tasks, which creates the DAG. Claims can be a field, and the stream is just a root task, or not? "Steering entry" sounds weird — like plan, it's just a single Q&A file / object per task, or not? Which means it can be a single field as well. That also renders the operations part completely wrong. Arbiter, worker, reviewer, curator — those are just agents.md. Routines are routines in the individual harnesses (Claude, Codex, …); this is just about having a setup prompt ready and the according skills which the routines can reference. Which brings us to the missing part: which skills do we need?

**Q (A→T): [Assistant: two entities, Task and Decision; skills substrate / stream / work / launch / review / consume / keepalive.] With claims as fields, is the arbiter's claim on the root task the liveness signal?**

A: Liveness just walks the DAGs for currently active root tasks. Yeah, makes sense.

---

## Part 9 — The review against the research

**Q (T→A): Write the design into a plan, then compare it fresh against the research: where we differ, whether that makes sense, what we're missing.**

A (assistant, deltas raised): Holds up — no limits, long-lived arbiter with re-read rule, reviews as plain tasks, no environment ownership. Risks — L1 evidence trusted for L1-only tasks; claim scope dropped; no way for a worker to say "can't". Gaps — decision ownership (P10), saturation gate (P1), relay depth (P16), parent completion underspecified, reviewer independence not checkable.

**Q (T→A): How do the others deal with a long-lived or short-lived arbiter?**

A (assistant): Mostly by not having one (Prove2Me, AlphaEvolve, OpenAI's periodic Codex consolidation) or by keeping sessions short and pushing state out (Anthropic Research lead writes plan to memory; Agent Teams' lead can't resume; Cursor still needs periodic fresh starts; Cursor Projects' coordinator persists context and restarts). Nobody has a long-lived arbiter that trusts its own memory.

**Q (T→A): The fact that no one checks L1 actually ran — that happens constantly, workers say they checked but didn't. What's the fix?**

A (assistant): The worker doesn't get to say done. Evidence is a command plus expected outcome, not prose; something else re-runs it and moves the task on.

**Q (T→A): What does orthogonality at claim time mean?**

A (assistant): A task declares which parts of the system it will touch; two active claims in one stream may not overlap. Concurrent work is disjoint by construction rather than reconciled after the fact. Cursor's hottest file went from 7,771 conflicts to 47 mostly by planning discipline; the reconciler only handled what slipped through.

**Q (T→A): P16 — I think there shouldn't be continuous relay; what did you mean?**

A (assistant): Relay is information passing agent → agent → agent, each hop lossy. Our design avoids it because briefs render from the substrate. The residual risk is planner nesting depth.

**Q (T→A, stated as answers to the deltas):**

A: We need a way for a worker to say "this won't work" — a feedback channel from worker to arbiter; some things you only learn when you do it. P10 makes sense. P1 makes sense. Each root's ACs must be covered by a task, and until it's done the arbiter must spawn more work for workers. Reviewer independence — yeah, we need a way to note who did what.

---

## Part 10 — Final decisions

**Q (A→T): Fold these into v0.2?**

A: For arbiter lifetime, maybe we combine this in a smart way. I get the tunnel-vision or running-in-circles issues with long-lived arbiters; doing this manually I often have to kill the arbiter. The persistence in these cases is the Q&A, plan and other documents. So a regular restart of the arbiter makes sense instead of a fully durable arbiter as a single session. The question is how we best do this — in an active harness this is easy. How did Prove2Me work as an active harness with Claude Max underneath?

**Q (T→A): How did Prove2Me work on Claude Max?**

A (assistant): There is no arbiter agent. A hosted passive platform holds a DAG of theorem "cards" with Lean statements and required natural-language descriptions. Contributors point their own Claude Code sessions (on their own Max subscriptions) at a mission; each session picks an open card, proves, submits; the kernel checks. Humans are "captains" who review core statements; an independent agent back-translates each statement for comparison. Anthropic's FLT run added a Claude Code multi-agent harness to launch dozens of sessions, but coordination was still the DAG. Sessions are short and disposable; the substrate is the only memory.

**A (T, continued): On L1 that didn't run — two options: either we are active again and run whatever mechanical verification commands there are, or the reviewer runs on every pass. Or both, since the reviewer running verification commands is also expensive ping-pong. On every task the framework enforces that verification (tests, checks, …) is green, and once that is given we also review (L2) every task with a fresh reviewer. Then the user-like testing (L3) is the only one that remains, which could then fall automatically on a fresh reviewer agent whenever a root task has all its subtasks marked as done — basically a final validation for the root.**

**A (T, continued): On claim orthogonality — that part with "what it touches" I didn't get, but that is genuinely smart to isolate agents and also build dependency bridges, or highlight where we need an external merger. I didn't have such bad experiences with merges, so not having perfect orthogonality is fine as long as the one agent merging parts is neither of the workers (the reconciler). But yeah, the Cursor pattern makes sense. Maybe we should persist this scope on the task, and the planner/arbiter creating the tree is directly responsible for creating suitable orthogonality while planning and steering. The reconciler can then merge whenever this didn't work perfectly — i.e. the plan not being perfect.**

**A (T, continued): P16 — I think there shouldn't be sub-planners. There is a single arbiter/planner who has access to the Q&A and it plans at any level. So when we split a task multiple levels deep it's always the arbiter thinking all the layers through. This way we also avoid split-brain issues. There is only a single brain awake at once and it plans across all levels. That's also why this arbiter/planner needs the strongest model, for complex reasoning. Yeah, fold those into the plan.**

---

## Part 11 — Handoff

**Q (T→A): You are now part of the project agent-skills-pipeline, a system of skills for harnesses for structuring work; the basis of previous iterations such as file-based planning. Many skills and agent definitions in there have valuable learnings. Look at the repo and understand which parts are useful for the new concept.**

A (assistant): No files from the project reach this sandbox; the repo lives at `/Users/tg/Development/agent-skills-pipeline` with git history; a chat session cannot read a local disk. Proper routes: Cowork in the cloud started on desktop with the folder attached (shares project memory), or Claude Code in the folder (native git history; plan docs must be committed).

**A (T): My main issue is that I want our entire conversation to be used as the starting point, not just the plan. Write a proper Q&A of our conversation, as well as the plan and as much rich detail as necessary; I will copy this over. [Then:] Which file is the Q&A-style interview document, and why is it not called like that? We just refined for hours that the Q&A document is the most valuable document above all.**

A (assistant): It was buried as a section inside a handoff file. This document is the correction.

---

## Part 12 — Mapping onto the existing pipeline

*18 September 2026, Claude Code session in the repo. The assistant read every skill and persona and wrote `repo-mapping.md`.*

**Q (A→T): The pipeline is built on ACs — prose ACs, an AC table in every review, "cheapest reliable evidence" per AC. The plan says ACs must be commands. Some ACs aren't; should an AC be markable as judged rather than mechanical?**

A: We specifically didn't talk about ACs anymore in the new design, because the overly strong focus on ACs in the pipeline is an issue: agents strictly follow ACs and miss the bigger goal. That's where the task trees help. Each task is a goal — similar to an AC but more focused on the outcome and less on a specific testable criterion — and we can have ever more nested tasks which are more and more detailed goals, and as such also ACs. So while a task might have ACs in its description, we don't strictly base our system on ACs anymore but on a task in its full description being done — the goal of the task being reached.

**Q (A→T): How big is a stream — a pipeline item, or a track?**

A: Track versus work package and t-shirt sizes go out. A stream, aka root task, is as big as needed to fulfil a piece of work. This creates flexibility in task division but also forces us to think more actively about how we structure the work — if and how many subagents, and so on.

**Q (A→T): The plan says the arbiter creates tasks at every level. The pipeline's hardest rule is that the orchestrator never creates scope. Who owns it?**

A: Scope authority is still a human thing. The human decides, in discussion with the agent, how far we go and what we need to reach, and also roughly how we get there. Generally, the higher we are in the tree, the more involved a human is. This system is not a hands-off factory; it's just a more flexible structure.

**Q (A→T): The plan has no human gates; the pipeline always has one before shipping. Model a gate as a task the human claims?**

A: We don't strictly need human gates. The reality is more like: an agent says it's done and the human contradicts and reopens. And since the arbiter is the agent the human interacts with, the human follows along — deep wherever the arbiter dives deep, shallow where the arbiter stays shallow. The goal is to surface enough information for the human to play ping-pong when necessary.

**Q (A→T): `rejected → ready` can loop; stop after a second rejection for the same reason?**

A: I am not scared of endless cycles. Those don't really happen in non-deterministic systems like AI agents.

**Q (A→T): `retro` and `compound` have no counterpart in the plan. Are the seven plan skills a new set, side by side with the pipeline, or an evolution in place?**

A: Retro as a task and compound as a capability should still exist. We are not strictly replacing all skills with a new set of skills here. We are adding a new task-and-decision backend and adapting our existing skills to work with that. But someone outside should also be able to use this new backend without our skills — basically bringing their own workflow. We build this on this branch, adapting our existing skills. A branch is by definition already a parallel version until it's merged.

**Q (A→T): Builder is sonnet and reviewer is opus — one family. Should "same model, different harness" fail the independence check?**

A: Cross-family review only works if there are multiple harnesses connected, so it's not a must but rather a do-if-possible.

---

## Part 13 — Refinements to v0.3, and the storage question opens

*18 September 2026, same session.*

**Q (A→T): I inferred that `plan` and `interview` may sit on any task, not only the root. Deliberate root-only, or fine?**

A: Exactly — interview and plan may sit at any level where needed, but always at the root. And the root plan and interview (as well as preferences learned in memory) will also guide at what deeper levels we need to plan and interview.

**Q (A→T): v0.3 replaced `acceptance_criteria` with optional `checks`.**

A: We don't have to completely remove ACs, since ACs are a meaningful word in engineering. But we have to weaken them, to make sure agents stop over-optimising for ACs, and instead strengthen goals.

**Q (A→T): Run the checks once when a task becomes ready, to catch checks that are already green before the work?**

A: If we can catch checks that are already green that's cool, but we do not actually have influence on the verification system. All we do is receive some sort of bash commands or similar as part of the setup. We probably rerun and let the verification system's internal caching deal with that, if it has one.

**Q (A→T): When a stream is archived, what gets rendered back into the repo — plan, decisions that still explain the code, deferrals?**

A: Not sure what rendered back into the repo means. When a stream is archived the work inside it is done and the repo already is the better representation than the task itself. Archived either means merged or abandoned; both are visible from the repo, and the repo is more truth than the task system.

**Q (A→T): Storage and interface — leaning single SQLite file plus a CLI?**

A: SQLite sounds simple at first, but when you consider that this repo might run on multiple computers, or even just multiple clones of the repo, and SQLite being a file again, it gets complicated quickly. Also, sure, SQL can generate a DAG, but is it really the best suited? We need something that works very easily locally as well as shared, and we should think about what is the most suitable structure. CLI is surely the base, but MCP also works in every harness and has auto-discovery, whereas a CLI means dropping into the agent prompt to discover. The real question is probably whether we also need hooks, in which case we need a full plugin. But a plugin might anyhow be useful for installation.

---

## Part 14 — Storage, interface, naming

*18 September 2026, same session. Research in `storage-interface-research.md`.*

**Q (A→T): Recommendation: one source of truth per project — SQLite file outside every clone for local; for shared, the same package run as a small server (the MCP server over HTTP). Is a small server of our own acceptable as the shared mode? Node and npm as the runtime?**

A: No SQLite. If we need to go SQL then we better go PGlite for local, and for remote, users can bring any SQL instance from wherever they want (Supabase, Neon, …). Local and remote must be the same dialect and functionality. A server is a bad idea, since that suddenly forces people to figure out a full hosting. Far too complex. Node and an npm package are fine as the runtime.

**Q (A→T): [The research reported per-harness differences: only Claude Code puts a plugin `bin/` on PATH, Codex scheduling is app-only, opencode has no scheduler or subagent hook, …]**

A: Every harness can do skills, MCP, routines, … today; those are very basic features. Your knowledge is outdated, and you as a Claude model massively overstate Claude features versus other harnesses. Do not assume anything about other harnesses except that they are at feature parity; otherwise research the latest docs.

**Q (T→A): Naming — I am anyhow thinking about renaming this repo to idle skills. We could try to claim the @idle org, and @idle/tasks is the task backend. Otherwise something like idle-tasks, whatever is available.**

A (assistant, checked on npm today): `@idle` is held by a dormant user account ("The Idle Man", 0 packages, 0 orgs) — user and org names share one namespace, so the org cannot simply be created; npm's name-dispute process is the only route. `idle-tasks` is taken (v0.1.3). Free today: `idletasks`, `idle-skills`.

---

## Part 15 — Build it here first; where credentials live

*19 September 2026, same session.*

**Q (A→T): Start on the npm package under a working name, or settle the name first?**

A: Before we turn it into an npm package, let's build it as a functional piece in this repo; we can still publish it later.

**Q (A→T): [Assistant listed as a cost of having no server: "every agent in shared mode holds database credentials".]**

A: It's not true that an agent holds database credentials. The service runs locally and the computer holds the credentials. The agent just uses the service that runs locally. The only issue is that the service is not reachable as a web service; it always requires a locally running service, which is guaranteed in our case.

**Q (T→A): Go ahead and devise a program plan for the backend, and devise how we would write / adapt the content of the skills.**

A (assistant): `backend-program-plan.md` and `skill-adaptation-plan.md`.

---

## Part 16 — Keep it a hobby product

*19 September 2026, same session. Answers to `backend-program-plan.md`.*

**Q (A→T): [Plan proposed a committed `tasks.config.json` with a project id, the PGlite directory in a per-user folder, and the shared-mode connection string in an environment variable.]**

A: The shared-mode config as well as the PGlite directory can be a directory in the user space.

**Q (A→T): [Plan proposed an append-only entries table: evidence, verdicts, earlier plan versions, rejections; `by` on every write.]**

A: No need to do evidence or history recording. This is not an enterprise product but a hobby product for vibe coders.

**Q (A→T): [Plan proposed running the whole test suite against both storage modes.]**

A: Don't exaggerate on test cases. Keep it simple and focus on the happy journey and the basic error cases.

---

## Part 17 — Tasks and decisions, nothing extra

*19 September 2026, same session. After the first build, which had four tables (tasks, edges, notes, decisions) and an added `subject` field.*

A (T, stated): Also remove the notes table. Like said initially, we don't provide observations; the lore skill stays for our individual version of notes. For now we only have tasks and decisions, exactly as defined in the concept, nothing extra.

---

## Part 18 — As few operations as possible; the name

*19 September 2026, same session. The first build had some twenty operations: create, propose, accept, decline, set, claim, renew, release, feedback, block, unblock, submit, verify, complete, reopen, …*

A (T, stated): There shouldn't be two operations for create and propose. Also update is the same action. It's all a single edit task, which creates or updates, and the task has a state. We keep the number of actions as minimal as possible.

A (T, stated): For naming we just stick to hyperidle CLI for now.

A (assistant, built): five operations. `task` and `decision` each create or update; `show` and `list` read; `doctor`. Every lifecycle move is `task --id … --status …`, checked against one transition table.

---

## Part 19 — The name, again

*20 September 2026.*

A (T, stated): There is already another hyperidle application. Let's just call it idle CLI to avoid conflicts.

---

## Part 20 — Just tasks; the system verifies; one planner; two layers

*20 September 2026, after the first pass of skill adaptation.*

A (T, stated): Is it possible to just drop tasks in our backend? Not every task is always properly structured. Generally I don't like this stream concept. In the beginning everything is a simple root task, and that can evolve into a nested tree of tasks. No need for a stream concept. The core idea here is that work planning isn't necessary as a skill anymore. Anyone can drop a new task anytime, and refine and plan can structure this. I want work planning deleted. Refine already includes a part where we define how a task should be worked on.

A (T, stated): Also the arbiter should not run the verification stuff; that is exactly the wrong design. The system should be able to take a set of configured shell commands, and when a task needs verification those are run, and the system, without an agent, can reset the state of the task if the verification fails.

A (T, stated): Also we probably need to merge arbiter and planner, since that is the same concept, just separate agent names. And as such also define the smallest part needed by pure idle CLI, and what idle CLI + agent skills pipeline is.

A (assistant, built): `work-planning` deleted; its value test moved into `refine`. "Stream" removed everywhere — there are tasks, and a root task may grow a tree. Checks are shell commands configured per project on the machine (`~/.idle/config.json`), never a field on a task; submitting a task makes the system run them where the work is and move the task on, or back to open with the output — no manual verify move exists. "Arbiter" is gone: the planner is the one agent that plans every level, and the same persona proposes when it is spawned for a single planning task. The two layers are defined in the plan, §1.

---

## Part 21 — Names

*21 September 2026.*

**Q (T→A): The last part is turning this into a plugin. Is idle already available as a Claude, Codex, … plugin?**

A (assistant, checked today): No plugin named `idle` in Anthropic's official (310) or community (2,282) marketplaces; the nearest is an unrelated `idle-timing`. From this repo the `idle` skill already ships, because every manifest points at the whole `skills/` folder — the backend does not: `tasks/` is in no file list, no manifest declares the MCP server, no installer copies it.

**Q (A→T): One plugin or two? And the ids — marketplace and plugin names are baked into hook cache paths, so changing them means a reinstall for everyone.**

A: I would like to rename the repo to idle agent tools — and the plugin. Idle agent tools marketplace, with idle-tasks and idle-skills.

---

## Distilled stances (for priming a fresh session)

- Not a harness; a framework for orchestration around harnesses. Simplicity; something in hours.
- Passive first; active only when needed; an agent with a shell can launch sessions itself.
- Work is the substrate. Tasks reference tasks → DAG. Claim = fields. Plan and interview Q&A = fields. There is no stream concept: anyone drops a task at any time, however unstructured; it starts as a single root task and refine and planning may grow it into a tree. No work-planning skill.
- Decisions: searchable entities, made by anyone, reviewable, supersedable.
- As few operations as possible: one edit per entity that creates or updates, and the task has a state. The CLI is `idle` (`hyperidle` is taken by another application). Repo and marketplace: `idle-agent-tools`. Two plugins in it: `idle-tasks` — the backend, its MCP server and the one `idle` skill, usable alone — and `idle-skills` — our workflow on top.
- The backend stores tasks and decisions, exactly as the concept defines them, and nothing extra. No notes, no observations — `lore` is our version of notes.
- Observations: own entity, char-capped, free-but-keyed subject, worker write / slow curation, archival first-class — deferred; inline comments work today.
- Git, PRs, worktrees, containers, policies: not ours; cannot assume they exist; opaque references only. Worktrees are for work; orchestration never goes through a commit.
- Interview beats a written plan. Steering only through the arbiter. Persisted steering is a curated Q&A, not a transcript. Workers never read it; they get the condensed plan plus their task and decisions in scope.
- Planner (once called arbiter — same concept, one name): one per tree, human-started, strongest model, plans every level, no sub-planners; restarted regularly; persistence is Q&A, plan, documents.
- Verification is the system's job, never an agent's: configured shell commands run when a task is submitted, and a failure resets the task with the output.
- Routines are harness-native scheduled runs with a setup prompt and skills; keep-alive and hygiene; minutes of latency is fine.
- Verification is uniform: the checks that exist are re-run mechanically (workers claim to verify and don't), a fresh reviewer judges every task — cross-family when more than one harness is connected — and a consumer view runs once at root completion.
- A task is a goal, not a list of ACs. Done means the goal in its full description is reached. Nested tasks are ever more detailed goals. ACs stay as a word but are weakened: signs that the goal is reached, never the contract. Verification commands come from the environment's setup; we re-run them and own nothing about them.
- Plan and interview: always on the root, at any deeper level where needed; the root's plan, interview and learned preferences guide where that is.
- The repo is more truth than the task system. An archived stream is merged or abandoned; nothing is rendered back.
- Storage is Postgres everywhere: PGlite locally, any Postgres the user brings (Supabase, Neon, …) when shared. Same dialect, same functionality. No SQLite, no server of our own — hosting is too much to ask. Runtime is Node; built as a functional piece inside this repo first, published as an npm package later; CLI is the base, MCP over the same core. The service always runs locally and the computer holds the credentials — the agent only talks to the local service.
- Harnesses are at feature parity for skills, MCP, hooks, routines. Never design around a supposed gap without reading that harness's current docs.
- A stream is as big as the work needs. No tracks, no work-package sizes; how the work is structured is an active decision each time.
- Scope is the human's, decided in discussion with the arbiter; the higher in the tree, the more human. Not a hands-off factory. No gates: the agent says done, the human contradicts and reopens; the arbiter surfaces enough for that ping-pong.
- Workers must have a feedback channel to the arbiter; some things you only learn by doing.
- Scope persisted on tasks; the arbiter owns orthogonality in planning; a neutral reconciler covers imperfect plans.
- No cost tracking, no limits. No evidence or history recording either: a hobby product for vibe coders, not an enterprise one. Config and local data live in user space. Tests cover the happy journey and the basic error cases, no more.
- Two layers. A task-and-decision backend anyone can use with their own workflow; and the existing pipeline skills, adapted to it rather than replaced. Roles are agents.md. Retro is a task; compound stays a capability.
- Storage and interface: implementation details, decided after the model.
