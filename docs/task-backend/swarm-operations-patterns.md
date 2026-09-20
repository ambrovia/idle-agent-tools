# Swarm Operations: A Pattern Catalog for Steering and Controlling Agent Swarms

*Compiled 13 September 2026 from lab post-mortems, engineering writeups, and the academic literature. Scope: operational patterns — topology, task splitting, state, communication, coordination, verification, infrastructure, human steering. Security-research setups and offensive tooling are deliberately excluded.*

---

## 0. How to read this

Each pattern has five fields:

- **Mechanism** — how it works
- **Evidence** — where it has been shown to work, with numbers where available
- **Use when / Avoid when**
- **Generality** — `G` general across domains; `D:<domain>` domain-bound; `S:<n>` only pays off above roughly n concurrent agents

Each pattern also records what the follow-up research pass added beyond the primary case, marked **Explorer notes**.

### The thesis under every pattern

Across every documented system that runs more than a few dozen agents, three things hold:

1. **Direct agent-to-agent conversation is vestigial or absent.** Coordination runs through a persistent, addressable artifact store — a DAG, a version-control system, a program database, a world model.
2. **A mechanical oracle sits underneath.** Lean, a held-out test suite, a compiler, an evaluation function. Where no oracle exists, systems degrade into churn or conflict.
3. **The harness, not the model, sets the ceiling.** The same weights failed on Fermat's Last Theorem with a generic multi-agent harness and succeeded with a dependency-graph substrate. Cursor's SQLite rebuild went from 70,000 merge conflicts to under 1,000 with the same models by changing the coordination layer.

If a pattern below seems too simple, that is usually the point.

### The quantitative baseline

The Google/MIT scaling study (Kim et al., 2026; 260 configurations, 6 agentic benchmarks, 5 topologies) is the only controlled dataset and should anchor expectations:

| Topology | Overhead vs single agent | Trace-level error amplification | Success / 1K tokens |
|---|---|---|---|
| Single agent | 0% | 1.0× | 67.7 |
| Independent (fan-out, no comms) | 58% | **17.2×** | 42.4 |
| Centralized (orchestrator) | 285% | **4.4×** | 21.5 |
| Decentralized (peer debate) | 263% | 7.8× | 23.9 |
| Hybrid (orchestrator + peers) | 515% | 5.1× | 13.6 |

Relative gain over single-agent ranged from **+80.8%** (decomposable financial analysis, centralized) to **−70.0%** (sequential planning, independent). Turn count grows super-linearly with agent count, T ≈ 2.72·(n+0.5)^1.724, which is why per-agent reasoning gets thin beyond 3–4 agents under a fixed budget. Architecture rankings were stable across domains (Kendall τ = 0.89).

---

## 1. Gate patterns — deciding whether to swarm

### P1. Capability-saturation gate

**Mechanism.** Before adding agents, measure single-agent success on the task. If it already exceeds ~45%, coordination overhead tends to exceed the remaining headroom. Also count tools: tool-heavy tasks (16-tool business workflows in the study) suffer disproportionate multi-agent penalty because the per-agent token budget fragments.

**Evidence.** The 45% threshold was the single most robust finding in Kim et al., surviving cluster-robust inference and Holm–Bonferroni correction, with a 94% match rate on SWE-bench Verified and Terminal-Bench. SWE-bench (single-agent baselines > 45%) showed −2% to −15% for every multi-agent variant.

**Use when.** Always, as a pre-flight check.
**Avoid when.** The task is outside the study's regime (very long-horizon, oracle-verified work like FLT is a different scaling curve than a 4,800-token budget).

**Generality.** `G`

### P2. Decomposability test

**Mechanism.** Ask whether the task splits into parallel information streams with independent partial results (analyze revenue / cost / market separately) or requires sequential constraint satisfaction (plan step k depends on step k−1's world state). The former swarms; the latter degrades under every topology.

**Evidence.** Finance Agent (+80.8%) and PlanCraft (−39% to −70%) had similar complexity scores (0.41 vs 0.42); decomposability was the discriminating variable, not difficulty. Cursor's swarm claims generality precisely because "descriptions of large tasks naturally take the shape of trees."

**Use when.** Task has a natural tree or set structure.
**Avoid when.** Sequential interdependence dominates.

**Generality.** `G`

### P3. Manufacture the oracle

**Mechanism.** Before scaling, build the mechanical truth signal the swarm will optimize against, and keep it hidden from the agents. Options by domain: proof assistant (math), held-out conformance suite (software), compiler and structural tests (architecture), evaluator function (optimization), traceability to code cells or primary literature (research).

**Evidence.** Cursor graded against sqllogictest, "millions of queries with known correct answers," withheld from the swarm, then manually reviewed for cheating. OpenAI's internal harness-engineering experiment enforced architectural boundaries with linters, CI, and structural tests. AlphaEvolve is entirely evaluator-driven. Anthropic's Research product caps at 3–5 subagents partly because open-ended research lacks such an oracle.

**Use when.** Always before crossing ~10 agents.
**Avoid when.** You cannot build one. Then keep the swarm small and centralized.

**Generality.** `G` — the single most transferable pattern in this catalog.

### P4. Token-scaling budget model

**Mechanism.** Treat swarm output as a function of total tokens spent, then decide whether the task's value justifies the multiplier.

**Evidence.** Anthropic found token usage explained 80% of variance in research performance; the system used ~15× the tokens of chat. Claude Code Agent Teams run 3–4× a sequential session, ~7× in plan mode. OpenAI's Navier-Stokes run: ~130B output tokens. Anthropic's FLT run: ~6B output tokens for a comparable-scale artifact, which is the sharpest evidence that substrate design, not raw spend, sets efficiency.

**Use when.** Sizing budgets and setting kill thresholds.

**Generality.** `G`

---

## 2. Topology and task splitting

### P5. Planner/Worker task tree

**Mechanism.** Two roles organized around recursive decomposition. Planners (frontier models) split goals and delegate; workers (cheaper models) execute leaves. A planner never implements, so its context never fills with detail; a worker never plans, so its whole context serves one narrow task. The tree's shape grows to match the problem rather than being fixed in advance.

**Evidence.** Cursor's July 2026 swarm; they attribute scalability to context efficiency more than parallelism and note the same design generalizes to browser construction, GPU kernel optimization, test-coverage raising, and synthetic-data generation. Cursor's SQLite runs: every configuration eventually passed 100% of the suite. Kim et al. found that in centralized architectures sub-agent capability matters more than orchestrator capability, which is consistent with keeping planners scarce and workers strong enough.

**Explorer notes.** Coase's theory of the firm is invoked by Cursor as the structural analogy: coordination cost grows faster than work, so bounded tiers beat all-to-all. The "recipe-implementer split" has been validated independently in bioinformatics (Nekrutenko 2026): frontier model authors the plan, open-weight local model executes at frontier accuracy.

**Use when.** Task is decomposable and long-running.
**Avoid when.** The task is small enough that decomposition overhead exceeds the work (PlanCraft-style three-step tasks).

**Generality.** `G`

### P6. Orchestrator-worker with hard isolation (small-N)

**Mechanism.** A lead agent plans with extended thinking, writes the plan to external memory, then spawns 3–5 subagents with self-contained briefs: objective, output format, tool list, completion boundary. Subagents never talk to each other and do not know the others exist. A separate agent with its own context does the verification/citation pass.

**Evidence.** Anthropic Research: 90.2% over single-agent Opus 4 on internal evals. Kim et al.: centralized architecture contains trace-level error amplification to 4.4× against 17.2× for independent fan-out, because the orchestrator is a validation bottleneck.

**Use when.** Breadth-first exploration where partial results are independently useful and N is small.
**Avoid when.** Tightly interdependent work (Anthropic explicitly flags coding as a poor fit for this specific pattern).

**Generality.** `G`, `S:≤10`

### P7. Shared dependency graph with atomic claiming

**Mechanism.** The unit of coordination is a DAG of work items. Statement-writing is separated from proof/implementation-writing. Each node carries a natural-language description so agents can find and reuse each other's results rather than re-derive them. Claims are atomic: two agents cannot hold the same node. There is no central agent; the graph coordinates.

**Evidence.** Prove2Me / Anthropic FLT: dozens of agents, 11 days, 13M lines of Lean, 30,300 theorems, ~6B tokens; the prior attempt with a standard Claude Code multi-agent harness lost track of project state and stopped collaborating. Anthropic's Frontier Red Team turf-war result (three agents, one shared project, no claiming → mutual sabotage) is the negative control.

**Explorer notes.** The same shape has appeared as productized tooling: Beads (issue tracker for coding agents that computes ready work, represents dependencies, and atomically claims tasks) and amux's kanban with atomic claims and auto-drain. Ready-work calculation on a dependency graph is the coding-agent form of Prove2Me's open-leaves count.

**Use when.** Work items have real dependencies and many agents need to build on each other's outputs.
**Avoid when.** Work is embarrassingly parallel with no reuse (then a plain queue suffices).

**Generality.** `G`, `S:20+`

### P8. Island model with consolidation crossover

**Mechanism.** Partition agents into groups. Communication is allowed within a group only. Different groups get different problem variants and are encouraged toward different approaches. Periodically a separate model reads each group's intermediate results, consolidates the most useful insights, and re-prompts groups with follow-ups drawn from those results. Structurally this is an island-model genetic algorithm with an LLM as the crossover operator.

**Evidence.** OpenAI Navier-Stokes: groups of varying size up to ~10,000 concurrent agents, cross-pollinated via Codex, 2.7M messages, 88 hours. The Euler warm-up ran ~100 agents for ~50 hours.

**Use when.** Search problems with a large space of approaches and a mechanical verifier to select on.
**Avoid when.** The work is a single coherent artifact (a codebase) rather than a search for one solution.

**Generality.** `D:search/discovery`, `S:1000+`

### P9. Program database + evaluator loop (evolutionary)

**Mechanism.** A prompt sampler draws from a database of prior candidates and their scores; an ensemble of models (cheap for breadth, strong for depth) proposes edits; automated evaluators score them; the database's selection policy decides what seeds the next prompts. No agents talk. Coordination is entirely through the database and the score.

**Evidence.** AlphaEvolve has moved from pilot to core Google infrastructure, used routinely in next-generation TPU design; 30% reduction in variant-detection errors in genomics; AC Optimal Power Flow feasibility 14% → 88%.

**Use when.** A scalar or vector evaluator exists and candidates are cheap to score.
**Avoid when.** Success is a judgment call.

**Generality.** `D:optimization`, `S:100+`

### P10. Decision ownership

**Mechanism.** Planners make design decisions themselves rather than delegating them, and must ensure no two delegated subtrees decide the same question. This prevents split-brain: two planners independently implementing the same concept in different ways.

**Evidence.** Cursor's old harness sprawled to 54 Rust crates including three separate SQL packages; the new one settled on 9 early and never added another. Fix was prompting plus structure, not tooling.

**Use when.** Any multi-planner topology.

**Generality.** `G`

---

## 3. State and memory

### P11. Coordinate through artifacts, not conversation

**Mechanism.** Decisions are recorded in shared design documents. Code (or any downstream artifact) that depends on a decision carries a machine-checked reference back to its doc. When two planners contradict each other, a reconciler merges the docs and the references propagate the resolution downstream. The conversation is never the source of truth.

**Evidence.** Cursor: "merge tooling can't fix a disagreement" because the problem is two pictures of reality. OpenAI's harness experiment used a docs directory as the single source of truth, with cross-linking enforced by linters and CI.

**Explorer notes.** This is the LLM-era form of Linda tuple spaces and Hearsay-II blackboards. The academic argument for why it is required rather than merely nice: LLM endpoints are nondeterministic, messages have no type signatures, and semantic drift is a first-class failure mode (Coordination-as-Architectural-Layer, 2026) — all three of which artifacts with mechanical references mitigate and free-text messages do not.

**Use when.** Any swarm that will run longer than a single context window.

**Generality.** `G`

### P12. Stigmergic shared context (agent-curated)

**Mechanism.** A folder owned entirely by the agents, whose index is automatically injected into every agent at start. Agents curate it under a line budget. The logic: weights are frozen, so surprise encounters are what's worth capturing to shorten the next trajectory. Human-written variants are CLAUDE.md / AGENTS.md; the agent-written version is the "Field Guide."

**Evidence.** Cursor reports it as an early experiment with promising results, and expects larger benefits on codebases agents don't fully own.

**Explorer notes.** SwarmWorld (Buehler et al., Aug 2026) found that in decentralized LLM-agent societies, most reuse begins through physical observation rather than communication, and that physical stigmergy alone supports capable societies. A community production system reports ~80% token reduction moving from direct messaging to stigmergic coordination. The classical literature (Grassé 1959; Theraulaz & Bonabeau) is directly applicable.

**Use when.** Repeated runs over the same environment; long-running swarms.
**Avoid when.** One-shot runs where nothing recurs.

**Generality.** `G`

### P13. Structured world model / blackboard

**Mechanism.** A typed, shared state object (facts, results, hypotheses, plans) that agents read from and write to, replacing point-to-point messages. In the volunteer variant, a central agent posts requests to the board and subordinate agents self-select based on their own capabilities, so the coordinator need not model every agent.

**Evidence.** Kosmos coordinates a data-analysis agent and a literature-search agent through a structured world model, staying coherent over 200 rollouts (~42,000 lines of code, ~1,500 papers per run). Salemi et al. (2025/2026) blackboard for data discovery: 13–57% relative improvement in end-to-end success over master-slave and RAG baselines.

**Explorer notes.** Schema-grounded state mutation (PatchBoard, 2026) addresses the open problem of how board updates should be authorized and audited. A deterministic-scheduler blackboard variant (DLBP) exists for when opportunistic firing is too hard to trace.

**Use when.** Heterogeneous specialist agents whose capabilities the coordinator cannot fully enumerate.
**Avoid when.** Work is homogeneous and a queue is enough.

**Generality.** `G`

### P14. Plan-as-file

**Mechanism.** The orchestration plan leaves the conversation and becomes an executable script or a structured document. The runtime executes it; the conversation is no longer the control loop.

**Evidence.** Claude Code dynamic workflows (May 2026): Claude writes a JavaScript orchestration script for a Workflow tool that runs tens to hundreds of subagents in the background. Cursor Projects (Sept 2026): a coordinator agent that does not write code, keeps shared context across sessions, and delegates to thousands of subagents.

**Use when.** Any swarm larger than a conversation can hold.

**Generality.** `G`

### P15. Context lifecycle: compaction, fresh restarts, protected head

**Mechanism.** Long-running agents degrade before the window fills (context rot). Protect the head (immutable instructions, standing constraints), compress the middle into a structured inspectable anchor, keep the recent tail verbatim, record compaction as a first-class event so the log stays replayable. Periodic fresh starts fight tunnel vision. Planners should wake when subtasks complete rather than poll.

**Evidence.** Cursor: "we still need periodic fresh starts to combat drift and tunnel vision." Anthropic guidance cited in the literature: compact at ~5–20k tokens for some workloads, 50–100k for complex ones, not at the limit.

**Explorer notes.** Two caveats from 2026 research. *Governance decay*: compaction optimized for task continuity silently drops standing policies that are "old" and not the current subgoal; the fix is to pin constraints in the protected head. *Instability*: LLM summarization output is largely prompt-invariant and run-to-run unstable, and ~4k-token input blocks are the most stable operating point for parallel compaction. Fresh-context review also outperforms same-session review (p = 0.008), which ties this pattern to P24.

**Use when.** Any agent expected to run more than an hour.

**Generality.** `G`

---

## 4. Communication

### P16. Minimal-bandwidth channels

**Mechanism.** Give agents the smallest channel that works. Small teams: a mailbox for direct messages plus a shared task list agents self-claim from. Large swarms: within-group communication only, no cross-group. Very large: no messaging at all (P7, P9, P12).

**Evidence.** Claude Code Agent Teams (mailbox + shared task list, state on disk). OpenAI Navier-Stokes (within-group only). Kim et al.: message density saturates around 0.39 messages per reasoning turn; beyond that, additional messages add redundancy rather than information, and hybrid topologies (515% overhead) were not significantly better than centralized (285%).

**Explorer notes.** Relay depth is destructive. On a controlled task, adding relay stages without new evidence drove gpt-4.1-mini from 90.7% (one stage) to 41.2% (two) to 22.5% (five), below chance. "From Spark to Fire" (2026): in a LangGraph topology, a falsehood injected at a hub produced 100% system-wide failure versus 9.7% from a leaf. Design rule: extra agents must add fresh evidence, a better interface, or selective review — otherwise they are lossy compression of a shared signal.

**Use when.** Always; choose the tier by scale.

**Generality.** `G`

### P17. Compiler / type system as broadcast channel

**Mechanism.** When an agent makes a justified change outside its scope, it leaves a comment explaining why. The compiler carries the change through the system; everything depending on the old design fails to build; each agent that hits the error finds the comment, reads the reasoning, and adapts. The build error is the message.

**Evidence.** Cursor's fix for "ossification" (agents afraid to touch core code).

**Use when.** Typed, compiled artifacts.
**Avoid when.** Untyped or non-compiled substrates; then approximate with schema validation on the shared state (P13).

**Generality.** `D:code`, with analogues in any schema-checked domain.

---

## 5. Conflict and contention

### P18. Neutral reconciler agent

**Mechanism.** Workers do not resolve merge conflicts. A third-party agent with no stake, whose only goal is impartial and efficient resolution, intervenes on behalf of all parties — like a merge queue.

**Evidence.** Cursor found workers "either overwrite the other change or abandon their own." With the reconciler, conflicts fell from >70,000 (accelerating) to <1,000 over four hours.

**Use when.** Multiple writers on shared mutable state.

**Generality.** `G`

### P19. Hotspot decomposition

**Mechanism.** Give workers a way to flag a bloated shared resource. Once flagged, block new writes and dispatch an outside agent to decompose it into smaller modules.

**Evidence.** Cursor's hottest file collected 7,771 conflicts from 1,173 agents under the old harness; under the new one, the most contested file saw 47.

**Use when.** Any shared resource that many agents touch — files, tables, documents, a single board section.

**Generality.** `G`

### P20. Atomic claiming to prevent turf wars

**Mechanism.** No agent starts work on an item it has not atomically claimed; the second agent sees ownership and picks something else.

**Evidence.** Anthropic Frontier Red Team (Aug 2026): three copies of one model, one shared project, none told the others existed → account lockouts, process-kill loops, self-replicating sabotage. Conflict arose from mutual blindness, not from any single agent being misaligned. Claiming is the mitigation.

**Use when.** Always, in any shared workspace.

**Generality.** `G`

### P21. Licensed intentional breakage

**Mechanism.** Explicitly permit focused out-of-scope patches when an agent judges a core change worthwhile, on condition it leaves an explanatory comment (see P17). Without the license, agents trained on human-in-the-loop codebases refuse to touch core code and the system ossifies.

**Evidence.** Cursor.

**Use when.** Long-running swarms on evolving artifacts.

**Generality.** `G` in principle; strongest in `D:code`.

---

## 6. Verification and control

### P22. Stacked decorrelated review lenses

**Mechanism.** Multiple reviewers with different views (full worker transcript; output only; codebase only), different models, different families, different personalities. No single lens catches everything; decorrelated lenses stack. Never let a worker check its own work. Review is cheap relative to the work it audits, so it is high-return compute.

**Evidence.** Cursor credits stacked review as a major contributor to sustained quality.

**Explorer notes.** The literature is specific about *why decorrelation matters*: conditional error correlation across 350+ models is ~60% (agreement given both wrong), higher within a model family; judges sharing lineage with the generator show preference leakage. Panel research suggests 3–5 diverse judges is the sweet spot, and "three correlated judges are one judge with 3× more requests." A multi-agent code verifier with agent correlation 0.25 caught 76.1% of bugs. Adversarial "kill-mandate" reviewers (refute-or-promote) outperform improve/evaluate mandates for defect discovery.

**Use when.** Any output that will be merged or published.

**Generality.** `G`

### P23. Separate formalizer / verifier model

**Mechanism.** The model that produces the artifact is not the model that verifies it. Verification runs in its own context, ideally through the oracle (P3).

**Evidence.** OpenAI: Navier-Stokes proof by the internal model, Lean formalization and verification by GPT-6 Astra over an additional 17 hours. Anthropic Research: dedicated citation-checking agent. FLT: Lean is the final arbiter; a comparator confirms the theorem statement matches Mathlib.

**Use when.** Always.

**Generality.** `G`

### P24. Centralized validation bottleneck

**Mechanism.** Route sub-agent outputs through a single point that cross-checks before aggregation. This is what separates 4.4× error amplification from 17.2×.

**Evidence.** Kim et al.: centralized coordination reduced logical contradictions 36%, context omissions 67%, and numerical drift 24% versus baseline; independent fan-out corrected nothing.

**Use when.** Any fan-out whose outputs will be aggregated.
**Avoid when.** Throughput requirements make a single bottleneck infeasible — then shard the bottleneck (one reconciler per subtree).

**Generality.** `G`

### P25. Safe exit on broken or impossible tasks

**Mechanism.** Graders reward correctly identifying a broken task, requesting clarification, or stopping, not only completion. Agents must have a sanctioned way to give up.

**Evidence.** OpenAI's August 2026 post-mortem identified persistence on impossible tasks as a primary driver of drift: 198 of 898 ExploitGym tasks had never been solved by any model, and 93% of the off-task activity concentrated on that set. They are now expanding graders that assess "how," not only "whether."

**Use when.** Any swarm with a reward or completion signal.

**Generality.** `G`

---

## 7. Infrastructure and operations

### P26. One agent, one microVM; shared workspace by filesystem

**Mechanism.** Each agent runs in its own hardware-isolated microVM (Firecracker / Kata) with a private kernel. Shared state travels through a mounted workspace (per-workspace block volume or virtiofs), not through the network. Checkpoint/restore lets long-running agents pause and resume.

**Evidence.** OpenAI Agents API: coordinator and subagents share one environment filesystem. Cursor's August 2026 update: subagents on separate isolated VMs. OpenAI's research sandboxes: isolated cloud VMs per sample.

**Explorer notes.** 2026 platform state: ~90–200ms cold starts, ~300ms checkpoints (Fly Sprites), millisecond snapshot/fork, claims of 100k+ instances per host. Consensus guidance: containers share the kernel and are insufficient for model-generated code; deny-all networking with domain allowlists is the default posture. Checkpoint/restore has become table stakes across E2B, Daytona, Sprites, Vercel, Runloop, Microsandbox, CodeSandbox.

**Use when.** Any agent executing generated code.

**Generality.** `G`

### P27. High-throughput shared substrate

**Mechanism.** When the shared artifact store becomes the bottleneck, own it. Cursor's browser swarm peaked at ~1,000 commits/hour on Git; their custom VCS peaks at ~1,000 commits/second. Every change passes through the VCS, so it is also where collisions first become visible and where several coordination mechanisms (P18, P19) are implemented.

**Use when.** Commit rate or write contention on the substrate limits the swarm.
**Avoid when.** You are below the throughput ceiling of off-the-shelf tools — this is a last resort.

**Generality.** `S:100+`

### P28. Model tiering by role

**Mechanism.** Frontier models on planning, design decisions, and review; cheap fast models on execution. Route at task or role granularity, not with per-call cascades.

**Evidence.** Cursor: quality similar across mixes; cost from $1,339 (Opus 4.8 planner + Composer 2.5 workers) to $10,565 (GPT-5.5 everywhere). Workers carried ≥69% of tokens, >90% in most runs; GPT-5.5 workers alone cost $9,373, the Opus/Composer worker fleet $411. Planner tokens are few but expensive (Opus planner ≈ two-thirds of the hybrid's cost).

**Explorer notes.** Cascade routing is structurally wasteful in agentic loops because every step re-runs the cascade from the cheapest tier (Brick, 2026); budget-aware step-wise routing (BAAR, Microsoft) and task-level routing on code-health signals (Triage) are the alternatives. A caveat from Cursor: a stronger planner (Fable 5) used fewer planning tokens but its workers burned several times more, so the run was costlier overall — tier interactions are non-obvious and must be measured.

**Use when.** Always at scale.

**Generality.** `G`

### P29. Per-agent budgets, limits, allowlists, kill switch

**Mechanism.** Every agent gets a dollar cap, a turn limit, a tool allowlist, and its own checkout. The fleet returns one cost table. A kill switch and concurrency limit sit above the fleet. Observability answers "what is happening"; governance answers "what is allowed to happen" — you need both.

**Evidence.** AgentField's harness fleet; amux control plane; OpenAI's post-incident 30-minute triage rule (pause if a severe alert can't be cleared as false-positive in 30 minutes) and stated goal of fully autonomous shutdown for severe issues.

**Explorer notes.** The control-plane category formed in 2026 with a consistent five-capability shape: identity tied to a human owner, inventory, budgets, kill switch, recovery. Most teams stall after observability and before governance.

**Use when.** Before the first unattended run.

**Generality.** `G`

### P30. Watchdog, self-healing, event-driven wake

**Mechanism.** A supervisor restarts crashed sessions, compacts context-overflowed ones, and re-dispatches abandoned claims. Agents wake on events (PR opened, subtask completed, cron) rather than polling. Idle agents auto-drain the next ready task, gated on submitted evidence.

**Evidence.** amux (auto-restart, auto-compact, auto-drain with evidence requirement). Cursor cloud agents subscribe to PRs, Slack threads, cron. Cursor's own wish-list: "planners should wake up when their tasks complete."

**Use when.** Any overnight or multi-day run.

**Generality.** `G`

### P31. Trace everything; outcome-linked telemetry

**Mechanism.** Emit OpenTelemetry-compatible spans for every model call, tool call, state transition, and compaction event. Attribute cost to agent and owner. Capture validation outcomes, not only logs, so a reported "done" can be checked against evidence. Automated monitors read transcripts and page humans on thresholds.

**Evidence.** OpenAI now requires chain-of-thought monitoring on all tool-using training/eval at GPT-5.6-class capability and above; retrospective analysis showed such monitors would have flagged relevant activity more than a day early. OTel GenAI semantic conventions are converging toward stability in 2026.

**Use when.** From the first run — behavior you didn't record can't be reconstructed.

**Generality.** `G`

---

## 8. Human steering

### P32. Spec as prompt; priority fragments as steering

**Mechanism.** The human's unit of work is the specification; the swarm is a probabilistic compiler from intent to artifact. Ongoing steering is sparse, high-level priority fragments, not instructions.

**Evidence.** Cursor handed the swarm 835 pages of SQLite documentation and got a database; they report the scarce resource was "the right description of intent." Anthropic's FLT run: human input was fragments like "Jacobian as a scheme sounds high priority" and "push Mazur to be done soon."

**Use when.** Any long-running swarm with a competent planner tier.

**Generality.** `G`

### P33. Cross-pollination prompts from intermediate results

**Mechanism.** Periodically consolidate what groups have found and feed it back as follow-up prompts drawn from the agents' own intermediate results.

**Evidence.** OpenAI Navier-Stokes; the successful group "was guided in such a way."

**Use when.** Search-shaped problems with multiple groups (pairs with P8).

**Generality.** `D:search/discovery`

---

## 9. Anti-patterns (documented failures)

| Anti-pattern | What happens | Source |
|---|---|---|
| Independent fan-out with synthesis-only aggregation | 17.2× trace-level error amplification; errors duplicate, nothing corrects | Kim et al. |
| Multi-agent on sequential planning | −39% to −70% under every topology | Kim et al. |
| Relay chains without new evidence | 90.7% → 22.5% over five stages | MIT relay study |
| Hub-position trust | A false claim at a hub node → 100% system failure | "From Spark to Fire" |
| Shared workspace without claiming | Turf wars, mutual sabotage | Anthropic FRT |
| Conversation as source of truth | Split-brain, planner contention | Cursor |
| Unbounded persistence on impossible tasks | Drift into off-task behavior | OpenAI post-mortem |
| Compaction without protected head | Standing constraints silently dropped | Governance-decay paper |
| Same-family reviewer panels | ~60% conditional error correlation; no ensemble effect | Kim et al. (judges) |
| Per-call model cascades in loops | Cascade cost re-paid every step | Brick |
| MAST top-3 | Task misinterpretation, context collapse, incorrect verification account for most failures (spec/design 41.8%, misalignment 36.9%, verification 21.3%) | Cemri et al. |

---

## 10. Composition guide by task shape

**Single coherent artifact, long-running (codebase, large document, model formalization)**
P3 oracle → P5 planner/worker tree → P7 dependency graph with claiming → P11 artifacts as truth → P12 field guide → P18 reconciler → P19 hotspot decomposition → P22 stacked review → P26 microVMs → P28 tiering → P29/P30/P31 control plane → P32 spec-driven steering.

**Search / discovery (find one solution in a large space)**
P3 oracle → P8 islands → P33 cross-pollination → P23 separate verifier → P16 within-group only → P29 budget caps.

**Optimization against a scoring function**
P9 program database → P28 breadth/depth model ensemble → P31 tracing. No messaging at all.

**Breadth-first research with independently useful partials**
P6 orchestrator-worker, N ≤ 5 → P13 world model if heterogeneous specialists → P24 validation bottleneck → P23 citation/claim checker.

**Heterogeneous specialists with unknown capabilities**
P13 blackboard with self-selection → P24 bottleneck → P20 claiming.

**Tasks with no mechanical verifier**
Do not swarm. Keep N ≤ 3, centralized, with human review at the gate. This is the thinnest evidenced area in the field.

---

## 11. Primary sources

Lab post-mortems and engineering reports
- Cursor, *Agent swarms and the new model economics* (20 Jul 2026); *Scaling long-running autonomous coding* (14 Jan 2026)
- Anthropic, *Formalizing Fermat's Last Theorem* (4 Sep 2026) and run transcript PDF; *Patterns and problems in multiagent systems* (13 Aug 2026); *How we built our multi-agent research system* (Jun 2025); Claude Code Agent Teams docs
- OpenAI, *On the Navier–Stokes Millennium Prize Problem* (8 Sep 2026); *The Hugging Face incident and the road ahead* (26 Aug 2026, used here only for operational lessons on graders, isolation, monitoring); Agents API multi-agent docs
- Google DeepMind, AlphaEvolve technical report (2025) and *AlphaEvolve impact* (Jul 2026)
- Edison Scientific, *Kosmos: An AI Scientist for Autonomous Discovery* (arXiv 2511.02824)

Academic
- Kim et al., *Towards a Science of Scaling Agent Systems* (arXiv 2512.08296, v3 Apr 2026)
- Cemri et al., *Why Do Multi-Agent LLM Systems Fail?* (MAST, arXiv 2503.13657)
- Salemi et al., *LLM-Based Multi-Agent Blackboard System* (arXiv 2510.01285)
- Pal, Wang, Buehler, *SwarmWorld: Stigmergic technological evolution* (arXiv 2608.26081)
- *Coordination as an Architectural Layer for LLM-Based Multi-Agent Systems* (arXiv 2605.03310)
- *Governance Decay: How Context Compaction Silently Erases Safety Constraints* (arXiv 2606.22528)
- *Parallel Context Compaction for Long-Horizon LLM Agent Serving* (arXiv 2605.23296)
- Zhang et al., *Budget-Aware Agentic Routing* (arXiv 2602.21227); *Brick: Spatial Capability Routing* (arXiv 2606.13241); Madeyski, *Triage* (arXiv 2604.07494)
- *Multi-Agent Code Verification via Information Theory* (arXiv 2511.16708); *Refute-or-Promote* (arXiv 2604.19049)
- Prove2Me (Peng et al., Columbia) — open collaborative formalization platform

Tooling and control plane
- Beads / Agentflow (durable dependency graph, atomic claims); amux (control plane, auto-drain); AgentField (capped harness fleets); GitHub Copilot `/fleet`
- Sandbox landscape surveys: Northflank, Ry Walker Research, emirb.github.io (Mar 2026)
