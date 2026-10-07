# Linear as a backend

*Built 3 October 2026, reworked 7 October, smoke-tested against a live workspace on 6 October.*

Linear replaces the storage behind idle-tasks, not idle-tasks: the lifecycle, the refusals and the checks on submit stay in idle-tasks. idle-skills does not change. (A version that let the skills talk to Linear directly, PR #58, lost the checks and was dropped.)

## Shape

Tools (CLI, MCP) → idle-tasks (`ops.mjs`, `views.mjs`, `records.mjs`) → storage. Storage is an adapter with one verb, `withData(fn)`: load the rows, let idle-tasks change them, save the changed ones. Two adapters, nothing shared: `sql.mjs` (PGlite or Postgres) and `linear.mjs`. Everything idle-tasks asks of its records is answered once, in `records.mjs`.

Where a repository's tasks live is the repository's setting, `.idle.json`; the key is the machine's, in `~/.idle/config.json`.

## Limits

- Two machines writing the same Linear tree at once are not serialised: the later write wins.
- Every call loads the whole Linear project.
- Leases are compared against the clock of the machine making the call, in every mode.
- Linear rewrites what it stores (a bare hostname comes back as a Markdown link), and idle reads it back that way.
- An issue moved to In Progress by hand is claimed by nobody; an agent can still claim it.
