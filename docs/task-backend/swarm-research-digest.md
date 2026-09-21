# Swarm Framework — Research Digest and Review Deltas

*Supporting evidence for the design. The full 33-pattern catalog with sources is in `swarm-operations-patterns.md`; P-numbers below refer to it. The primary document is `swarm-design-interview-qa.md`.*

## 1. Research digest

### 1.1 What the labs actually run

We started from "how do Anthropic and OpenAI steer agent swarms" and moved past the everyday tooling (subagents, Agent Teams, Agents SDK, AgentKit) to the hyperscale systems behind the September 2026 results. Three cases carried most of the evidence:

**OpenAI, Navier-Stokes (8 Sep 2026).** Not a flat swarm. Agents subdivided into groups with communication only within a group; the group that produced the resolution had roughly 10,000 concurrent agents. Different groups got different problem-statement variants and were pushed toward diverse approaches. Periodically a separate model (Codex) consolidated the most useful insights across groups and re-prompted them with follow-ups drawn from their own intermediate results. Structurally an island-model genetic algorithm with an LLM as the crossover operator. 88 hours to resolution, plus 17 hours of Lean formalization by a separate model (GPT-6 Astra). ~2.7M inter-agent messages and ~130B output tokens for this problem alone.

**Anthropic, Fermat's Last Theorem (Sep 2026).** The cleanest natural experiment in the field. First attempt with a standard Claude Code multi-agent harness failed: agents accumulated local context, lost track of proved results, duplicated work. The successful run used Prove2Me (Tianyi Peng, Columbia): a hosted, passive platform maintaining a DAG of theorem statements ("cards"), statement-writing separated from proof-writing, a required natural-language description on every card so agents find and reuse rather than re-derive. No central agent; the DAG coordinated. Dozens of agents, 11 days, 13M lines of Lean, 30,300 theorems, ~6B output tokens — about 20× less than the OpenAI run for a comparable artifact. Human input was priority fragments ("Jacobian as a scheme sounds high priority"). Prove2Me runs on contributors' own Claude Max subscriptions; humans act as "captains" reviewing mission core statements; an independent agent back-translates each Lean statement to natural language for comparison.

**Cursor, SQLite-in-Rust (20 Jul 2026).** The deepest engineering writeup on a non-math swarm. Task: implement the 835-page SQLite manual in Rust with source, tests, binary and internet withheld; graded against sqllogictest, which the swarm was never told existed, then manually reviewed for cheating. Architecture: planners (frontier models) decompose and delegate, workers (cheap models) execute; a planner never implements, a worker never plans — scaling comes from context efficiency more than parallelism. They wrote their own VCS (Git peaked ~1,000 commits/hour; theirs ~1,000/second). Documented failure modes and fixes: split-brain design (planners must decide, not delegate decisions), planner contention (shared design docs with compile-checked references plus a reconciler), merge conflicts (a neutral third-party merge agent), megafiles (flag and decompose), ossification (licensed intentional breakage carried by the compiler). Stacked decorrelated review lenses. An agent-owned "Field Guide" folder auto-injected at start. Numbers, same models and budget: old harness >70,000 merge conflicts vs <1,000; hottest file 7,771 conflicts vs 47; 54 crates vs 9; 64,305 engine lines vs 9,908 at equal test pass rate. Cost swing $1,339 to $10,565 depending on model mix; workers carried ≥69% of tokens.

Other anchors: Anthropic Frontier Red Team (13 Aug 2026) — three copies of one model on a shared project, none told the others existed, escalated to account lockouts, process-kill loops and self-replicating sabotage; the conflict came from mutual blindness, not misalignment. Kosmos (Edison Scientific) — a structured world model shared between a data-analysis agent and a literature agent keeps 200 rollouts coherent. AlphaEvolve — program database + evaluator loop, no agent messaging at all, now core Google infrastructure. Anthropic's Riemann bound work ran ~60 subagents. Claude Code dynamic workflows (May 2026) move the plan out of the conversation into a script.

### 1.2 The thesis

1. At scale, direct agent-to-agent conversation is vestigial or absent. Coordination runs through a persistent, addressable artifact store: a DAG, a VCS, a program database, a world model.
2. A mechanical oracle sits underneath: Lean, a held-out test suite, a compiler, an evaluation function. Where no oracle exists, systems degrade into churn or conflict. This is why Anthropic's Research product caps at 3–5 subagents.
3. The harness, not the model, sets the ceiling. Same weights failed FLT with a generic harness and succeeded with a DAG substrate.

### 1.3 The quantitative baseline (Kim et al., "Towards a Science of Scaling Agent Systems", 260 configs)

- Capability-saturation gate: when single-agent success already exceeds ~45%, adding agents tends to hurt.
- Decomposability, not difficulty, predicts multi-agent gain: +80.8% on parallel financial analysis, −70% on sequential planning.
- Error amplification: independent fan-out 17.2×, centralized (orchestrator as validation bottleneck) 4.4×, decentralized 7.8×, hybrid 5.1×.
- Overhead: centralized 285%, hybrid 515% with no significant gain over centralized.
- Sub-agent capability matters more than orchestrator capability in centralized topologies.
- Turn count grows super-linearly with agent count; per-agent reasoning gets thin beyond 3–4 agents under fixed budget.

### 1.4 Other research facts that shaped decisions

- MAST taxonomy: failures are 41.8% specification/design, 36.9% inter-agent misalignment, 21.3% verification ("the agent believed it was done").
- Relay decay: gpt-4.1-mini 90.7% → 41.2% → 22.5% over 1, 2, 5 relay stages with no new evidence. A falsehood at a hub node caused 100% system failure vs 9.7% from a leaf.
- Reviewer independence: conditional error correlation across models is ~60% when both are wrong, higher within a family; fresh-context review beat same-session review (p = 0.008); a multi-agent verifier with agent correlation 0.25 caught 76.1% of bugs; 3–5 diverse judges is the sweet spot.
- Governance decay: context compaction silently drops standing constraints unless pinned in a protected head.
- Safe exit: OpenAI's Aug 2026 post-mortem found persistence on impossible tasks was the primary driver of drift; graders now assess "how", not just "whether".
- Stigmergy: in SwarmWorld most reuse began by observing others' work rather than messaging.
- Blackboard with agent self-selection: 13–57% relative improvement over master-slave.

---


## 2. Fresh-reviewer deltas against the research, and resolutions

**Held up as deliberate divergences:** no limits/cost (only claim expiry survives as a control); reviews as plain tasks rather than a built-in lens pipeline; no environment ownership (Cursor built a VCS; we build nothing).

**Risks raised and resolved:**
- Evidence trusted for L1-only tasks → resolved by uniform verification with routine re-run (Q&A, Part 10).
- Claim scope dropped from the model → restored as `scope` on Task (Q&A, Part 10).
- No terminal outcome for "can't" (P25 safe exit) → `blocked` status + `feedback` field.

**Gaps closed:** decision ownership rule (P10); capability-saturation gate (P1); relay depth (P16) resolved by design — no sub-planners, briefs rendered from the substrate not relayed; parent completion via automatic integrate task; reviewer independence made checkable via `by` fields; root-AC coverage render.

**Gaps deliberately left:** observations/stigmergy/curation/hotspot decomposition (second pass); island-model and evolutionary topologies (out of scope for a coordination substrate).

**One flagged consequence:** keepalive now does real work (re-running evidence, creating review/integrate/L3 tasks), so it needs an actual harness routine, not bare cron; the `launch` recipe and the routine setup prompt are the same problem and should be solved together on day one.

---

