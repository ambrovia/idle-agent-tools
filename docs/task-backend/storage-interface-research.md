# Storage and interface — research and decision

*18 September 2026. Sections 1–2 are web-verified research with sources inline. Section 4 is the decision from Q&A Part 14, with local measurements.*

## 1. What prior art teaches

**Beads** (now `gastownhall/beads`, v1.3.0) is the closest thing to what we are building, and its storage history is the lesson:

- 2025: SQLite + git-tracked JSONL mirror + daemon. The two-way sync grew a collision resolver, a 3-way merge engine and tombstones. In 0.51 (Feb 2026) all of it was deleted — "too fragile to be workable".
- 0.56 made a Dolt *server* mandatory; solo users called it a regression ("still single-user local, but with a MySQL server in the middle", [#2050](https://github.com/steveyegge/beads/issues/2050)). 1.0 reverted to embedded by default.
- Today: claim is a SQL compare-and-set in one transaction — atomic **within one database only**. Across machines (Dolt push/pull over the git remote) a claim is advisory; 1.3.0 added leases and a replica guard to cope.
- Still open: two machines creating children under one parent allocate the same sequential IDs and sync blocks ([#4796](https://github.com/gastownhall/beads/issues/4796)). Locally allocated sequential IDs have bitten them twice.

Others: **Claude Code Tasks / agent teams** — lock-guarded files under `~/.claude/tasks/`, one machine, no CLI/MCP, "can't share a team across sessions" ([docs](https://code.claude.com/docs/en/agent-teams)). **Backlog.md**, **claude-task-master** — files in git, no atomic claim. **task-graph-mcp** — one SQLite WAL file, DAG + atomic claim, single machine.

What held up: one authoritative transactional store; a shared *server* for multi-machine. What caused trouble: a DB plus a git-tracked mirror; local sequential IDs; supporting many storage modes; forcing a server on solo users; pretending a replicated claim is atomic.

## 2. Is SQL the right structure?

The graph is the easy part: a few thousand nodes, ancestor chain, children, "ready = all references done". Recursive CTEs over an indexed edge table answer these in milliseconds. The hard requirements are transactional — *claim only if unheld and no active scope overlaps* — and search-before-create. Those are transaction and index problems.

Embedded graph databases don't help: Kùzu was archived Oct 2025 after acquisition; its successor LadybugDB allows one writer process and has no shared mode — fails local multi-process outright. CRDT stores (cr-sqlite stalled since Jan 2024, Automerge-style) cannot do conditional claims by design.

| Option | Local, many processes | Shared, many machines | Atomic claim across machines | FTS | Health |
|---|---|---|---|---|---|
| SQLite (WAL, `BEGIN IMMEDIATE`) | yes | no | — | FTS5 | excellent; `node:sqlite` is RC since Node 25.7, FTS5 compiled in |
| SQLite + libSQL `sqld` via `@libsql/client` | yes | yes | yes | FTS5 | `sqld` in maintenance; Turso steering to a Rust engine with no recursive CTE, no FTS5, experimental multi-process |
| PGlite → Postgres | only via a socket daemon | yes | yes | tsvector | active; second process silently forks the DB |
| Dolt | server mode only | yes | server yes, merge no | — | active; 40 MB binary, Go-only embedding |
| rqlite / D1 | daemon / cloud | yes | single statement only | FTS5 | active |

## 3. Harnesses

Assume feature parity: skills, MCP (stdio and remote), hooks and routines are basic features everywhere (Q&A Part 14). Nothing in the design may lean on a supposed gap in one harness. The per-harness detail that does matter — which file declares an MCP server, how an env var reaches it — is looked up in that harness's current docs at build time, not remembered.

What follows from that: **one npm package that is both the CLI and the MCP server**, run with `npx`, declared by the plugin in each harness's own way.

## 4. Decision (Q&A Part 14) and what it implies

**Postgres dialect everywhere. PGlite locally; any Postgres the user brings when shared (Supabase, Neon, self-hosted). No SQLite. No server of our own.**

One source of truth per project, never a mirror, never synced through git — that part of the Beads lesson stands.

### Local: PGlite needs one rule

PGlite allows one process per data directory, and every CLI call and every session's MCP server is its own process. Measured today (PGlite 0.5.8, Node 22.23, this machine):

| | result |
|---|---|
| First create of a data dir | ~1.0 s |
| Reopen an existing dir | ~140 ms; query ~10 ms; close ~5 ms |
| 6 processes at once, each *lock → open → claim → close* | exactly one wins the claim; all done in ~1 s |
| 4 processes at once, **no lock** | two both "won" the same claim, the other two hung |

So the rule: **every operation is lock → open → one transaction → close.** Nobody holds the database open — including the MCP server, which opens per call. ~150 ms per operation is nothing against minutes-of-latency routines. The lock is a lock file beside the data dir carrying PID and time, stolen when the PID is dead. The data dir lives outside every clone, in a per-user directory keyed by a project id from a small committed config file, so all worktrees and clones on a machine share it.

### Shared: a connection string

The config names an env var; the env var holds the connection string; nothing secret is committed. Same SQL, same migrations, through a thin adapter (`query`, `transaction`) over PGlite's API locally and a wire driver remotely.

- **Claim.** One transaction: `pg_advisory_xact_lock` on the stream, check unheld and no overlapping active scope, write the lease. Transaction-level advisory locks work through the transaction-mode poolers Supabase and Neon put in front, and in PGlite. Session-level features are off the table for that reason.
- **Search before create.** `tsvector` + GIN, `pg_trgm` for near-duplicates — available in PGlite and on every hosted Postgres.
- **DAG.** `tasks.parent` plus an `edges` table; recursive CTEs for ancestors and ready.
- **Prose caps.** `CHECK` constraints — enforced by the database in both modes, not by whichever client happens to write.
- **IDs.** Random, never sequential (Beads, twice).
- **Migrations.** A version table; the CLI migrates on open, under an advisory lock.

Verified in PGlite 0.5.8 today: transaction-level advisory lock, `tsvector` + GIN, `pg_trgm` similarity, recursive ancestor CTE, `CHECK` cap rejecting an over-long row, `gen_random_uuid()`. Not yet verified against a live Supabase or Neon pooler — to be done with the first shared-mode test.

### What this costs, honestly

- Two dependencies instead of none: PGlite (25 MB installed) and a Postgres driver.
- The service is never reachable as a web service; every machine runs it locally (the CLI, or the MCP server its harness starts). That is guaranteed in our case. The computer holds the connection string, the local service enforces the rules, and the agent only ever talks to the local service.
- Moving a project from local to shared is a dump and restore — same dialect, so it is one command.

## 5. Naming

Checked on npm today: `@idle` is held by a dormant user account ("The Idle Man", 0 packages, 0 orgs). User and org names share a namespace, so the org cannot be created; npm's name-dispute process is the only route and takes weeks with no guarantee. `idle-tasks` is taken (v0.1.3). Free: `idletasks`, `idle-skills`. No packages exist under any `@idle/*` today.
