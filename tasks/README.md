# idle tasks

A shared record of work for coding agents. Agents do not talk to each other; they read and write this.

- **Two things are stored:** tasks — goals that nest into trees, need each other, and carry scope — and decisions.
- **Four operations**, the same over the `idle` CLI and over MCP: `task` and `decision` create or update, `show` and `list` read. Everything else is a state: `proposed → open → claimed → submitted → verified → done`, plus `blocked` and `archived`.
- **Anyone can drop a task.** A title is enough. It is searched for near-duplicates first.
- **Claims are leases**, refused when the scope overlaps another live claim in the same tree.
- **The system verifies, not an agent.** Submitting a task runs your project's configured shell commands where the work is, and sends a failing task back to `open` with the output.
- **Storage lives in your home folder:** PGlite by default, or any Postgres you bring. Same SQL either way.

Bring your own workflow — or use [idle-skills](https://github.com/ambrovia/idle-agent-tools), a multi-agent development workflow built on it.

## Use

```bash
npx @idle-agent-tools/tasks help
npx @idle-agent-tools/tasks task --title "Newsletter signup on the landing page"
npx @idle-agent-tools/tasks list
```

As an MCP server (stdio), in any harness:

```json
{ "mcpServers": { "idle": { "command": "npx", "args": ["-y", "@idle-agent-tools/tasks", "mcp"] } } }
```

## Configure

`~/.idle/config.json` — all optional:

```json
{
  "checks": { "my-repo": ["npm run verify"] },
  "review": true,
  "database": "postgres://…"
}
```

`checks` are run by the system when a task in that project is submitted. `review` makes a verified task wait for someone who did not do the work. `database` switches from the local PGlite folder to a shared Postgres. The project label is the repository's name, so every clone and worktree lands on the same tasks.

The `idle` skill in `skills/idle/SKILL.md` tells an agent everything above.

Apache-2.0
