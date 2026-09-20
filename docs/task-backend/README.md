# Swarm Framework — Handover

*18 September 2026. Design work for a lightweight framework that helps with orchestration around existing harnesses (not a harness). Start here.*

## Read in this order

| # | File | What it is | Status |
|---|---|---|---|
| 1 | `swarm-design-interview-qa.md` | **The primary artifact.** The curated question-and-answer record of the design conversation, chronological, answers in Tobi's words. Every decision in the plan traces back to an entry here. Ends with a one-screen list of distilled stances for priming. | authoritative |
| 2 | `swarm-framework-plan.md` | The plan, v0.3. Derived from the Q&A: principles, the two-entity model (Task, Decision), lifecycle, uniform verification, roles, skills, routines, deferred decisions, first build. | derived — regenerate from the Q&A if they conflict |
| 3 | `swarm-research-digest.md` | The research that informed the answers: the three hyperscale cases (OpenAI Navier-Stokes, Anthropic FLT / Prove2Me, Cursor SQLite), the thesis, the quantitative baseline, and the fresh-reviewer deltas against the research with how each was resolved. | supporting |
| 4 | `repo-mapping.md` | Every existing skill, persona and hook mapped against the plan: what carries, what is rewritten, what the goal-not-AC shift changes. Raised the questions answered in Q&A Part 12. | working |
| 5 | `storage-interface-research.md` | Web-verified research on prior art (Beads) and database options; the storage decision (Postgres everywhere: PGlite local, user-brought Postgres shared) with local measurements. | decided, Q&A Part 14 |
| 6 | `backend-program-plan.md` | How the backend works in plain words, what is deliberately simple, and the build order. | awaiting confirmation |
| 7 | `skill-adaptation-plan.md` | How every skill, persona and hook changes, in three stages that each keep the pipeline working. | awaiting confirmation |
| 8 | `swarm-operations-patterns.md` | The full 33-pattern catalog with sources. Reference only; consult by P-number when a plan decision needs its evidence. | reference |

If a fresh session has budget for one file, it's #1. If two, #1 and #2.

## Relationship between the files

The Q&A is the persisted steering — the same kind of artifact the framework's arbiter is meant to keep for a stream. The plan is the condensed, worker-facing version of it. The digest and the catalog are the evidence the arbiter consulted. This mirrors the framework's own model on purpose: interview → Q&A → plan → work.

## What's next


1. ~~Repo analysis~~ — done, `repo-mapping.md`; answers in Q&A Part 12, folded into plan v0.3.
2. ~~Storage and interface~~ — decided, Q&A Part 14.
3. **Build** — backend steps 0–2 per `backend-program-plan.md`, then skill stage A per `skill-adaptation-plan.md` as the first real stream on the backend.


## Provenance

Produced in a claude.ai chat session inside the project "agent-skills-pipeline". The conversation transcript itself does not transfer; these four files are the complete durable output.
