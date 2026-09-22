<h1 align="center">Idle Agent Tools</h1>

<p align="center">
  <b>A shared record of work for coding agents, and a multi-agent development workflow on top of it.</b><br>
  From agentic development to agents <i>as the developer team</i>.
</p>

---

Two plugins, usable together or apart. One marketplace serves both on every harness.

### [`idle-tasks/`](idle-tasks/) — the record of work

Agents do not talk to each other; they read and write one record. It holds two things: **tasks** — goals that nest into trees, need each other and carry scope — and **decisions**. Anyone can drop a task at any time; a title is enough. Four operations (`task`, `decision`, `show`, `list`), the same over the `idle` CLI and over MCP; everything else is a state. Claims are leases, refused when scopes overlap. When a task is submitted **the system runs your project's checks itself** and sends a failing task back with the output — no agent's word counts. It lives in your home folder on PGlite, or on any Postgres you bring. It knows nothing about our workflow: bring your own. Also on npm as [`idle-agent-tasks`](https://www.npmjs.com/package/idle-agent-tasks).

### [`idle-skills/`](idle-skills/) — the workflow

A dropped task starts with an interview: the planner asks, you decide, and the answers become a goal and a plan in your own words. The planner breaks the work into goals, builders work them, the system runs the checks, fresh reviewers judge whether each *goal* is reached — and you contradict what is not done. Fifteen skills, three personas, hooks that put fresh evidence in front of every agent when it starts. Needs idle-tasks.

```
drop a task ──▶ interview ──▶ plan the tree ──▶ build ──▶ checks ──▶ review ──▶ ship
   anyone      you + planner     planner        builder    system    reviewer   builder
```

## Layout

| Path | Role |
|---|---|
| [`idle-tasks/`](idle-tasks/) | The **idle-tasks** plugin: the `idle` CLI and MCP server, the `idle` skill, its manifests for every harness. Published to npm as `idle-agent-tasks` |
| [`idle-skills/`](idle-skills/) | The **idle-skills** plugin: skills, personas, hooks, its manifests for every harness |
| [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json), [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json), [`.cursor-plugin/marketplace.json`](.cursor-plugin/marketplace.json) | The marketplace, for Claude Code, Codex and Cursor |
| [`scripts/`](scripts/) | Installers for the harnesses without a marketplace, and the persona generator |
| [`tests/`](tests/) | `npm run verify` — the backend against PGlite (and Postgres with `IDLE_TEST_DATABASE_URL`), the hooks, the installers |
| [`docs/task-backend/`](docs/task-backend/) | The design record: the interview Q&A everything traces back to, the plan, the research |

## Install

Support levels differ by host:

| Host | Skills | Personas | Hooks | Record of work | How |
|---|---|---|---|---|---|
| **APM** | yes | yes | yes | add the MCP server yourself | `apm install` → harness dirs |
| **Claude Code** | yes | yes | yes | plugin (MCP + the `idle` CLI) | native plugin marketplace |
| **Cursor** | yes | yes | yes | plugin (MCP from npm) | native plugin / Team Marketplace, or `scripts/install-cursor.sh` |
| **Codex** | yes | via script | yes | plugin (MCP from npm) | plugin marketplace + `scripts/install-codex.sh` for personas |
| **Antigravity** | yes | yes | no | plugin (MCP from npm) | `scripts/install-antigravity.sh` |
| **opencode** | yes | yes | yes | installer writes `opencode.json` | `scripts/install-opencode.sh` (JS plugin is hooks-only) |
| **Copilot / Gemini** | copy or APM | Claude-format agents | yes | add the MCP server yourself | hooks configs shipped; skills via APM or manual copy |

Anywhere else, the record of work is one MCP server: `npx -y idle-agent-tasks mcp`.

### Upgrading from `agent-pipeline`

The marketplace was renamed, so an existing install does not move by itself. Remove the old one and add the new:

```text
/plugin uninstall pipeline@agent-pipeline
/plugin marketplace remove agent-pipeline
/plugin marketplace add ambrovia/idle-agent-tools
```

then install both plugins as below. Skills keep their names; their prefix becomes `idle-skills:`. Codex asks once to re-approve the hooks, because their paths changed. Items that exist only as `.pipeline/work/<id>/plan.md` are adopted by `/pipeline` as tasks.

### APM

```bash
apm install ambrovia/idle-agent-tools/idle-tasks
apm install ambrovia/idle-agent-tools/idle-skills
```

Each plugin folder is an APM package (`apm.yml`, `includes: auto`); APM deploys the skills and agents into the consumer's harness directories. The record's MCP server is not part of the APM contract — add `npx -y idle-agent-tasks mcp` to your harness yourself. Prefer this when the project already uses APM.

### Claude Code — plugin

```text
/plugin marketplace add ambrovia/idle-agent-tools
/plugin install idle-tasks@idle-agent-tools
/plugin install idle-skills@idle-agent-tools
```

`idle-tasks` is the record of work on its own — the `idle` CLI, its MCP server and the `/idle` skill — and works with any workflow. `idle-skills` is the workflow on top and needs it. The orchestrator is `/pipeline`; `/setup`, `/lore` and `/compound` are the other commands you invoke directly. The phase skills are dispatched by the orchestrator, not run by hand.

### Cursor — plugin

Native Cursor plugins via each plugin's `.cursor-plugin/plugin.json`. Team Marketplace import (Cursor 2.6+, Teams/Enterprise):

```text
Dashboard → Plugins → Team Marketplaces → Import from Repo
https://github.com/ambrovia/idle-agent-tools
```

Then install **idle-tasks** and **idle-skills** from Customize (skills, `agents-cursor/`, `hooks/cursor-hooks.json`).

```bash
scripts/install-cursor.sh                 # copies → ~/.cursor/plugins/local/idle-skills and idle-tasks
scripts/install-cursor.sh /path/to/project  # or --project: copy into .cursor/
```

### Antigravity — installer

```bash
scripts/install-antigravity.sh   # → ~/.gemini/config/plugins/idle-skills and idle-tasks
```

The IDE and the `agy` CLI both read that folder. Antigravity copies whatever directory it is pointed at, so the script stages only what it reads: `plugin.json`, the skills, the personas from [`idle-skills/agents-antigravity/`](idle-skills/agents-antigravity/) (name and description only — it drops an agent with frontmatter fields it does not know), and for idle-tasks [`mcp_config.json`](idle-tasks/mcp_config.json). Hooks are not installed.

### Codex — plugin

[`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json) lists both plugins. Plugin install gives skills, the record's MCP server, and the Codex hook wiring in `idle-skills/hooks/hooks.json`.

```text
codex plugin marketplace add ambrovia/idle-agent-tools
```

Restart Codex, open `/plugins`, install `idle-tasks` and `idle-skills`. Personas are **not** in the plugin contract — register them with:

```bash
scripts/install-codex.sh /path/to/project
```

That writes `.codex/agents/*.toml` and namespaced `[agents.pipeline-*]` entries in `.codex/config.toml`.

### opencode — installer

[`idle-skills/.opencode/plugins/pipeline.js`](idle-skills/.opencode/plugins/pipeline.js) covers post-edit guards only. For skills, personas, and session-start guidance:

```text
scripts/install-opencode.sh            # current project
scripts/install-opencode.sh ../my-app  # another project
scripts/install-opencode.sh --global   # ~/.config/opencode
```

| Piece | Destination |
|---|---|
| Skills | `.opencode/skills/` |
| Agents | `.opencode/agents/` (`@pipeline-planner`, …) |
| Post-edit guards | `.opencode/plugins/pipeline.js` |
| Session-start | managed block in `AGENTS.md` |
| Record of work | `mcp.idle` in `opencode.json` (started from npm) |



### Copilot / Gemini — hooks + skills copy

Hook configs ship with the workflow plugin ([`idle-skills/.github/hooks/pipeline.json`](idle-skills/.github/hooks/pipeline.json), [`idle-skills/.gemini/settings.json`](idle-skills/.gemini/settings.json)). Skills are not a native plugin on these hosts — use APM, or copy `idle-skills/skills/` and `idle-tasks/skills/` (and Claude-format `idle-skills/agents/` if needed):

| Tool | Skills path |
|---|---|
| Copilot | `.github/skills/` or `.agents/skills/` |
| Gemini / Antigravity | `.gemini/skills/` or `.agents/skills/` |

`.agents/skills/` is the shared location APM targets for most harnesses. Claude Code still uses `.claude/skills/`.

## Configure

The record of work is configured per machine in `~/.idle/config.json` — see [idle-tasks](idle-tasks/README.md#configure). The workflow is configured per repository in `pipeline.config.yml` — see [idle-skills](idle-skills/README.md#configure).

## License

[Apache-2.0](LICENSE).
