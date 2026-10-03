# Linear as a backend — proposal

*3 October 2026. How idle-tasks could keep its tasks in Linear instead of PGlite/Postgres. Not built; this is the approach and the questions to settle first.*

## Where it plugs in

idle-skills never touches storage. Every skill, persona and hook goes through the four operations (`task`, `decision`, `show`, `list`) over MCP or the `idle` CLI (`idle-skills/hooks/inject.mjs` shells out to `idle list` and `idle show --state`). So **nothing in idle-skills changes**; the whole job is inside `idle-tasks/`.

Inside idle-tasks the seam is not clean yet. `store.mjs` has one verb, `withTx(fn)`, and hands `fn` a raw SQL function `q`. Everything above it is Postgres:

- `ops.mjs` — about 30 SQL statements: the lifecycle, claims, near-duplicate search, decisions.
- `views.mjs` — 7 more for the brief, the tree state and the tree render.
- Postgres-only features carry real semantics: `pg_advisory_xact_lock` serialises claims within a tree, `pg_trgm` `similarity()` finds near-duplicate titles, recursive CTEs walk lineage and archive subtrees, `CHECK` constraints enforce the caps, and `claim_expires > now()` is asked of the database clock.

A Linear backend therefore needs a **store interface** between the operations and the SQL, with the current SQL as one implementation and Linear's GraphQL API as the other.

## Step 1 — a store interface (no behaviour change)

Move the lifecycle rules (the `move()` transition table, refusals, settle, check running) out of SQL into plain JS that calls a small store. Roughly:

| Store method | Today's SQL |
|---|---|
| `getTask(id)`, `getTasks(ids)` | `load`, the `any($1)` lookups |
| `createTask(fields)`, `updateTask(id, fields)` | insert / update |
| `appendLine(id, 'feedback' \| 'verdict', line)` | `field = field \|\| $2` |
| `children(id)`, `treeRows(root)`, `lineage(id)` | parent lookups, recursive CTEs |
| `similarTasks(title, scope)`, `similarDecisions(root, statement)` | `pg_trgm` |
| `liveClaims(root)`, `ready(project, root?)` | `LIVE`, `READY` |
| `withClaimLock(root, fn)` | `pg_advisory_xact_lock` |
| `getDecision`, `createDecision`, `bindDecision`, `supersede`, `decisionsInRoot` | decisions table |
| `roots(project, opts)` | `list` without `--root` |

Caps move into JS validation (the `CHECK` constraints stay on Postgres as a second line). `tests/tasks.test.mjs` runs unchanged against PGlite and proves the refactor. This step is worth doing on its own and is the bulk of the code change.

## Step 2 — the Linear store

Config in `~/.idle/config.json`:

```json
{ "backend": "linear", "linear": { "team": "ENG", "apiKeyEnv": "LINEAR_API_KEY" } }
```

The key lives in an env var, never in the file. `doctor` reports `mode: linear` and whether the key and team resolve.

### Mapping

| idle | Linear |
|---|---|
| task | issue |
| `parent` / `root` | sub-issue (`parentId`); root = top-level issue |
| `project` (repo name) | a Linear project per repository, created on first use *(open question 2)* |
| `title`, `goal` | title, description |
| `acceptance_criteria`, `plan`, `interview`, `scenario` | sections of the description under fixed headings *(or Linear documents)* |
| `needs` | "blocked by" issue relations |
| `status` | workflow state by type: proposed → Triage (or Backlog), open → Todo, claimed/submitted → In Progress, verified → In Review, done → Done, archived → Canceled; blocked → Todo + a `blocked` label |
| `feedback`, `verdict` | comments, prefixed `feedback:` / `verdict:` |
| `scope`, `claimed_by`, `claim_expires`, `decision_refs`, `metadata` | JSON in the `metadata` of one attachment idle owns on each issue (Linear has no custom fields; attachment metadata is the usual place for machine state, and humans don't edit it by accident) |
| decision | an issue with a `decision` label in the same project, statement as title, rationale as description, linked to the tasks it binds; superseded → Canceled with a relation to its replacement *(open question 3)* |
| ids `T-xxxxxx` | Linear identifiers (`ENG-123`); the CLI and skills treat ids as opaque, so this works |
| near-duplicate search | `searchIssues` full-text, ranked; weaker than trigrams but adequate |

### What gets weaker

- **Claims.** Linear has no transactions or compare-and-set, so two machines can both "win" a claim. Mitigation: on one machine, the existing lock directory already serialises it. Across machines, claim by writing a claim comment with a nonce, then read back the issue's claim comments and keep the earliest live one; the loser gets the usual refusal. Good enough for a hobby product; not airtight.
- **Lease clock.** Expiry is compared against Linear's `updatedAt`/comment timestamps rather than the database clock.
- **Speed.** Each operation becomes several GraphQL round trips (a `show --state` on a large tree may need paging). Fine for MCP calls, noticeable for the session-start hook.
- **Rate limits.** Linear's API key limit is generous for one person; a swarm of agents polling `list --ready` could hit it.

### What stays the same

Checks still run locally on submit and the system still moves the task on or back. The four operations, their flags and their refusals are unchanged, so the `idle` skill, idle-skills and the hooks work as they do today. A human can now also drop a task by creating an issue in the Linear project, and watch the tree move on Linear's board.

## Alternative — mirror instead of backend

Keep PGlite/Postgres as the source of truth and mirror tasks to Linear one way (or pull new Linear issues in as dropped tasks). Claims stay atomic and nothing in `ops.mjs` changes, but it is a sync engine with conflict handling, and edits made in Linear are second-class. Recommended only if airtight claims across machines matter more than Linear being the real record.

## Open questions

1. **Source of truth or mirror?** Recommended: Linear as the real backend (step 1 + step 2).
2. **Repository → Linear project, or → a label on one shared project?** Recommended: one Linear project per repository.
3. **Decisions: labelled issues, or Linear documents on the project?** Recommended: labelled issues, because they can be related to the tasks they bind and searched the same way.
4. **Does `proposed` map to Triage?** Only if the team has Triage turned on; otherwise Backlog.
5. **Multi-machine claims:** is best-effort (nonce comment, earliest wins) acceptable?

## Order of work

1. Store interface, PGlite and Postgres behind it, tests green. One PR, no behaviour change.
2. Linear store behind `"backend": "linear"`, with a test suite that runs against a real Linear workspace when `IDLE_TEST_LINEAR_TEAM` and `LINEAR_API_KEY` are set, and is skipped otherwise.
3. README and the `idle` skill: one paragraph on the Linear mode. idle-tasks version bump; idle-skills needs no change and no bump.
