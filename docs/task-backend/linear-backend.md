# Linear as a backend

*3 October 2026. Linear as a third storage backend for idle-tasks, beside PGlite and Postgres. Built; the GraphQL client has not yet been run against a live workspace.*

## The decision

Tobi, 3 October: Linear replaces the *storage* behind idle-tasks, not idle-tasks itself. idle-tasks keeps the lifecycle, the refusals, and — the point — running the project's checks itself when a task is submitted. No agent verifies. An attempt that let idle-skills talk to Linear directly (closed PR #58) lost exactly that and was dropped.

idle-skills does not change: it only uses the four operations.

## How it is built

- **A store interface.** The operations and views ask a store (`idle-tasks/src/pg-store.mjs`) instead of writing SQL. Caps are refused in JS as well, so a store without `CHECK` constraints keeps them.
- **A snapshot store.** `memory-store.mjs` answers the same questions over an in-memory snapshot of every task and decision, including pg_trgm's similarity for near-duplicates.
- **Linear.** `linear.mjs` runs each operation under the machine's lock: it loads the team's issues into a snapshot, runs the operation in memory, and writes back only the rows that changed. A refused operation writes nothing — the transaction Linear does not have. `linear-client.mjs` is the GraphQL API reduced to nine calls; `linear-fake.mjs` answers the same calls from a JSON file for tests.

Config: `{ "backend": "linear", "linear": { "team": "ENG", "apiKey": "lin_api_…" } }` — the key beside the rest of the machine's settings, as a database URL is (Tobi, 5 October).

## The mapping

| idle | Linear |
|---|---|
| task, children | issue, sub-issues |
| project label | a Linear project of that name, created on first use |
| `goal`, `acceptance_criteria`, `plan`, `interview`, `consumer_scenario` | the description: the goal, then `## Signs the goal is reached`, `## Plan`, `## Interview`, `## How it is used` |
| status | proposed → Triage (or Backlog), open → Todo, claimed → In Progress, submitted/verified → In Review, done → Done, archived → Canceled; blocked = Todo + label `blocked` |
| decision | issue labelled `decision`: Done while in force, Canceled when superseded |
| scope, needs, claims, feedback, verdict, decision refs, `meta`, idle's own id | metadata of an attachment idle keeps on each issue (`https://idle.invalid/<id>`); needs also shown as blocked-by relations |

What people change in Linear counts: title, description, state and parent are read back on every call. An issue created in the project from Linear is a task, with its Linear identifier as id.

## What is weaker than Postgres

- **Two machines.** One machine is serialised by its lock. Two machines writing the same tree at the same moment are not: the later write wins, and two claims can both succeed.
- **Speed.** Every call loads the whole team's project issues. Fine for a hobby workspace; slow for a large team.
- **Leases** are compared against this machine's clock, not the database's.

## Tested

`IDLE_TEST_BACKEND=linear` runs the whole operations journey (`tests/tasks.test.mjs`) against the fake workspace, and `tests/linear.test.mjs` covers the mapping and human edits. Both are in `npm run verify`. The GraphQL client itself is untested: this sandbox cannot reach api.linear.app and holds no key.
