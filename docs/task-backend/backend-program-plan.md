# Backend — program plan

*19 September 2026. How the task-and-decision backend works, in plain words, and the order we build it in. Derived from plan v0.3 and Q&A Parts 13–15. Working name: the `idle` CLI; lives in `tasks/` in this repo, published later. Steps 0–4 and 6 are built, and the package is on npm as `idle-agent-tasks`; step 5 (a hosted Postgres behind its pooler) has only been run against a local Postgres 17.*

## What it is

A small local service. An agent — or a human, or a routine — asks it to do one thing to the record of work: drop a task, claim one, submit it, write feedback, record a decision, show a brief. It answers and exits. It launches no session and touches no git; the only commands it ever runs are a project's configured checks. It is workflow-neutral: nothing in it knows about our skills.

## How it works

**A tiny set of operations, and a set of states.** Four are offered to agents: `task` creates or updates a task; `decision` creates or updates a decision; `show` reads one; `list` reads many (streams, a stream's tree, what is ready, a stream's decisions). A fifth, `doctor`, is for the human at a shell. Everything else is state: a task is `proposed`, `open`, `claimed`, `submitted`, `verified`, `done`, `blocked` or `archived` (`verified` is set only by the system); a decision is `active` or `superseded`. There is no claim, submit, block or reopen operation — a task has a state, and every move is `task --id … --status …`, checked against one table of allowed transitions. Moving to `claimed` claims or renews; moving back to `open` releases, accepts, unblocks, rejects or reopens depending on where the task was, and asks for the reason where one is owed.

**One list, three faces.** Each operation is defined once: a name, a description, the inputs it takes, and the function that does it. The CLI, the MCP server and the help text are all generated from that list, so they cannot drift apart.

**Everything lives in user space.** One folder in the home directory holds the config file and the local database. Nothing is committed to any repo and there is no init step. One database serves all of a user's projects; each stream carries a project label, taken from the repository's name (worktrees resolve to their main repository) and overridable, so clones and worktrees of one repo land on the same streams.

**Two modes, one SQL.**

- *Local.* The default. The data is a PGlite directory in that folder. PGlite allows one process at a time, so every operation is: take the lock file, open, run one transaction, close, release. About 150 ms. Nobody holds the database open, including the MCP server. A lock whose owning process is dead is taken over.
- *Shared.* The config file holds a Postgres connection string — any Postgres the user brings. Present means shared, absent means local; `doctor` says which one a machine is on.

Both modes go through one thin adapter with a single verb: *run this function inside a transaction*. Everything above it is the same SQL.

**What is stored.** Two tables, exactly the two entities of the concept: `tasks` and `decisions`, with the fields from plan §3 and nothing extra. References and decision refs are list fields on the task. `feedback` and `verdict` are text fields that grow by one capped line — a worker's feedback; why a task came back. That is all the history there is: no notes, no evidence log, no plan versions, no audit trail. One column is not in the concept: `project`, the label that lets one user-space database hold every repository's streams. Ids are short and random (`T-7f3k2q`, `D-9x1m4c`), never counters. Size caps are `CHECK` constraints, so the database refuses an essay no matter who wrote the client.

**What is stored and what is worked out.** Stored statuses are few: `proposed`, `open`, `claimed`, `submitted`, `verified`, `done`, `blocked`, plus `archived` on roots. The rest of the lifecycle in plan §4 is derived on read: a task is *ready* when it is open and everything it references is done; A *rejection* is not a state: the task goes back to `open` with the reason on its `verdict`. Nothing needs to "recompute ready", so there is one less thing a routine can forget.

**Creating.** A `task` call without an id first searches — word search plus near-duplicate matching — over live tasks in the same stream (or over active decisions, for `decide`). If it finds something close it creates nothing and returns the candidates; the caller repeats the call with `confirm` to create anyway. If it finds nothing, it creates at once. A proposal is a task created with status `proposed`, open to anyone; accepting it — moving it to `open` — is the planner's move, and for a new root the human's.

**Claiming.** One transaction: lock the stream, check the task is ready and unheld, check that none of its scope strings overlaps the scope of any other live claim in the stream, write who holds it and until when. Two scope strings overlap when they are equal or one is a path-prefix of the other. A claim is a lease: setting `claimed` again extends it, setting `open` gives it back, and an expired lease is simply ignored by the next claimer — there is no sweeper.

**Who is calling.** A claim, a note and a decision record `by` — a short free string such as `claude/opus/ab12`, from the environment (a launch recipe sets it) or a flag. Nothing here is authentication. Integrity comes from structure: transitions are checked against the lifecycle, and a verdict is refused when it comes from whoever held the claim.

**Verification is the system's, not an agent's.** `~/.idle/config.json` names the shell commands that verify each project — configured on the machine, never a field on a task. Submitting a task is one transaction; then, outside any transaction, the system runs those commands where the work is (the task's recorded worktree, else where the call was made) and in a second transaction moves the task to `verified` or back to `open` with the command, its exit code and the tail of its output. Nobody can move a task from `submitted` by hand. A task left `submitted` by a crash is submitted again. A reviewer acts one step later: `verified` → `done`, or back to `open` with the blocking findings.

**The human's moves.** Reopen is `done` → `open` with the reason. Superseding is an update to a decision; every live task bound by the old one shows up as flagged. Archiving a root archives everything under it. The planner makes these moves on the human's word.

**Views.** Not new operations — two ways of showing: `show --brief` is what a worker starts from (goal, what it is for up the chain of ancestors, signs the goal is reached, why it came back, checks, scope, the nearest plan, decisions in force, what it builds on); `show --state` is the whole stream for the planner and the human's ping-pong (goal, plan, interview, what needs attention, feedback from the work, tree, ready, live claims, recently done, decisions in force). Markdown. Their length is bounded by the field caps; there is no separate budget.

**MCP.** `idle mcp` serves the same four operations over stdio, generated from the same list, with no dependency of its own. It holds nothing open: each tool call is one transaction, like one CLI call. It learns the harness's name from the handshake and uses it as `by` unless the agent says who it is.

## Deliberately simple

- Scope overlap is string prefix, not globs. Enough until a plan needs more.
- No roles, no auth, no row-level security. Add per-role credentials when a team does not trust its own agents.
- No events, no watch, no notifications. Routines poll; minutes are fine.
- Local → shared is a dump and a restore, run once by hand.
- No observations table. `@lore` keeps doing that job.

## Build order

Each step ends with something that runs. Tests stay small: the happy journey and the basic error cases, in `tests/` under the existing `npm test`. Plain ESM, no build step, like the hooks.

| # | Step | Done when |
|---|---|---|
| 0 | Skeleton: `tasks/` with its own `package.json`; the adapter with both modes; lock; migrations; `init`, `doctor`. Dependencies install on first run, as the design viewer already does. | Several processes race for one claim: one winner, no hang. |
| 1 | The five operations, the transition table, and the CLI generated from the list. | A stream can be opened, decomposed, claimed and submitted from a shell. Scope overlap refuses a second claim. Caps refuse an essay. |
| 2 | Renders, as views of `show` rather than new operations: the brief for a task, the root state for a stream. | A cold session given only a task's brief has what plan §8 lists. |
| 3 | The review setting switched on: `verified` waits for a reviewer who did not do the work. | A reopened task's brief says why it came back. |
| 4 | MCP server from the same operations list. | One harness runs the happy journey through MCP. |
| 5 | Shared mode against a real hosted Postgres behind its pooler. | The happy journey passes unchanged against it. |
| 6 | Shipping inside the plugin: each harness's own MCP declaration (read from its current docs at that point), installers carry `tasks/`. | A fresh install on each harness lists the tools. |

Steps 0–2 are built with the pipeline as it is today. From there the skill adaptation (see `skill-adaptation-plan.md`) is the first real stream run on the backend — it is where we find out where the model is wrong.

## Settled since the first draft

Derived states (`ready` and rejection are worked out, not stored) — built. `subject` — dropped with everything else not in the concept (Q&A Part 17). The name — the `idle` CLI (Parts 18–19).
