<h1 align="center">Idle Agent Tools</h1>

<p align="center">
  <b>Structured, multi-agent software development for any AI coding tool.</b><br>
  From agentic development to agents <i>as the developer team</i>.
</p>

---

Freeform "vibe coding" with an agent fails at scale: no separation between deciding *what* to build and building it, the author grades their own homework, scope creeps, review gets skipped when "it's simple," and nothing compounds.

**Pipeline** replaces that with a plan you own and a shape you agree. Work is broken into **items**, and each one starts with an interview: the orchestrator asks, you decide, and the answers become a plan of 50–100 lines in your own words — what you need, and how the program works.

```
interview ──▶ agree the shape ──▶ build ──▶ review ──▶ ship
  you + orchestrator                builder   reviewer   builder
        │                              │
        └── gates you place ───────────┘
```

There is no fixed sequence. How much ceremony an item gets is set by three dials, agreed with you and revisited as the work reveals itself:

| dial | question | governs |
|---|---|---|
| **complexity** | how big is the work? | how it is broken up, and how many agents run |
| **ambiguity** | how clear is the topic? | how much interview, and whether design or architecture happen at all |
| **exposure** | how far does it reach? | how independent the review is, and how deep |

- **The plan is yours.** It is written with you, not handed to you, and nothing else in the run may quietly grow it.
- **You place the gates.** They are agreed during planning and written into the plan. Between them the agent runs unattended; there is always one before shipping.
- **A hundred bugs and one architectural decision get different treatment.** Size and difficulty are separate dials, so neither drowns in the other's ceremony.
- **Gates are mechanical where they can be.** Your `verify` command must pass and the review verdict must be `DONE` before ship.

## What's in here

| Path | Role |
|---|---|
| [`apm.yml`](apm.yml) | [APM](https://microsoft.github.io/apm/) package manifest |
| [`skills/`](skills/) | Pipeline skills (`SKILL.md`, [Agent Skills](https://agents.md/) standard) |
| [`personas/`](personas/) | Persona source of truth; [`scripts/generate-agents.mjs`](scripts/generate-agents.mjs) renders every host format below |
| [`agents/`](agents/) | Claude-format `pipeline-planner` / `pipeline-reviewer` / `pipeline-builder` personas (generated) |
| [`agents-cursor/`](agents-cursor/) | Cursor-format personas (`model: inherit`, generated) |
| [`hooks/`](hooks/) | Session-start + edit-streak + thrash guards, and spawn-time evidence injection (Claude, Cursor, Gemini, Copilot, Codex, opencode) |
| [`.claude-plugin/`](.claude-plugin/) | Claude Code plugin + marketplace |
| [`.cursor-plugin/`](.cursor-plugin/) | Cursor plugin + Team Marketplace |
| [`.codex-plugin/`](.codex-plugin/) | Codex plugin (+ [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json)) |
| [`.opencode/plugins/pipeline.js`](.opencode/plugins/pipeline.js) | opencode post-edit plugin (also exported by [`package.json`](package.json)) |

## Install

Support levels differ by host:

| Host | Skills | Personas | Hooks | How |
|---|---|---|---|---|
| **APM** | yes | yes | yes | `apm install` → harness dirs |
| **Claude Code** | yes | yes | yes | native plugin marketplace |
| **Cursor** | yes | yes | yes | native plugin / Team Marketplace, or `scripts/install-cursor.sh` |
| **Codex** | yes | via script | yes | plugin marketplace + `scripts/install-codex.sh` for personas |
| **opencode** | yes | yes | yes | `scripts/install-opencode.sh` (JS plugin is hooks-only) |
| **Copilot / Gemini** | copy or APM | Claude-format agents | yes | hooks configs shipped; skills via APM or manual copy |

### APM

```bash
apm install ambrovia/idle-agent-tools
```

APM reads the plugin layout (`plugin.json` / `.claude-plugin/`, `skills/`, `agents/`, `hooks/`) and deploys into the consumer's harness directories. Prefer this when the project already uses APM.

### Claude Code — plugin

```text
/plugin marketplace add ambrovia/idle-agent-tools
/plugin install idle-tasks@idle-agent-tools
/plugin install idle-skills@idle-agent-tools
```

`idle-tasks` is the record of work on its own — the `idle` CLI, its MCP server and the `/idle` skill — and works with any workflow. `idle-skills` is the workflow on top and needs it. The orchestrator is `/pipeline`; `/setup`, `/lore` and `/compound` are the other commands you invoke directly. The phase skills are dispatched by the orchestrator, not run by hand.

### Cursor — plugin

Native Cursor plugin via [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json). Team Marketplace import (Cursor 2.6+, Teams/Enterprise):

```text
Dashboard → Plugins → Team Marketplaces → Import from Repo
https://github.com/ambrovia/idle-agent-tools
```

Then install **idle-tasks** and **idle-skills** from Customize (skills, `agents-cursor/`, `hooks/cursor-hooks.json`).

```bash
scripts/install-cursor.sh                 # symlink → ~/.cursor/plugins/local/pipeline
scripts/install-cursor.sh /path/to/project  # or --project: copy into .cursor/
```

### Codex — plugin

[`.codex-plugin/plugin.json`](.codex-plugin/plugin.json) + [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json). Plugin install gives skills, `agents/openai.yaml`, and the Codex hook wiring in `hooks/hooks.json`.

```text
codex plugin marketplace add ambrovia/idle-agent-tools
```

Restart Codex, open `/plugins`, install `idle-tasks` and `idle-skills`. Personas are **not** in the plugin contract — register them with:

```bash
scripts/install-codex.sh /path/to/project
```

That writes `.codex/agents/*.toml` and namespaced `[agents.pipeline-*]` entries in `.codex/config.toml`.

### opencode — installer

[`.opencode/plugins/pipeline.js`](.opencode/plugins/pipeline.js) covers post-edit guards only. For skills, personas, and session-start guidance:

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

Not published to npm. Opening this repo in opencode loads the JS plugin from `.opencode/plugins/` automatically.

### Copilot / Gemini — hooks + skills copy

Hook configs ship in-repo ([`.github/hooks/pipeline.json`](.github/hooks/pipeline.json), [`.gemini/settings.json`](.gemini/settings.json)). Skills are not a native plugin on these hosts — use APM, or copy `skills/` (and Claude-format `agents/` if needed):

| Tool | Skills path |
|---|---|
| Copilot | `.github/skills/` or `.agents/skills/` |
| Gemini / Antigravity | `.gemini/skills/` or `.agents/skills/` |

`.agents/skills/` is the shared location APM targets for most harnesses. Claude Code still uses `.claude/skills/`.

## Configure

Everything project-specific lives in one file. Copy [`pipeline.config.example.yml`](pipeline.config.example.yml) to `pipeline.config.yml`; skills resolve `{{key}}` from it:

```yaml
verify: "go test ./..."   # the single command that must pass before ship
engineering:
  tier: mvp               # prototype | mvp | production | critical — the customer and rigor the code targets
designSystem: null        # null → the design round never runs
vcs: github
# worktree:               # optional repository-owned lifecycle commands
#   bootstrap: "go mod download"
#   cleanup: null
```

The **engineering tier** is load-bearing and is chosen by customer, not by aspiration:

| Tier | Customer | Expected result |
|---|---|---|
| `prototype` | Builders or an internal demo audience | The core flow can be demonstrated, often with manual steps. Key features may still be missing. |
| `mvp` | Early, tolerant users | The core works most of the time. Auxiliary features, polish, and less-common edge cases may be missing. |
| `production` | Ordinary public or paying users | Standard ordinary software: it works normally and reliably, with proportionate tests, error handling, and security. It does not imply enterprise controls. |
| `critical` | Large-company, regulated, contractual, or high-consequence customers | Adds the rigor actually demanded by that context, such as compliance evidence, audit trails, rollback procedures, stronger operational controls, and exhaustive failure handling. |

Do not choose `critical` merely because software is deployed or stores real user data. Feature flags, audit systems, elaborate observability, formal rollback machinery, exhaustive fallbacks, and speculative abstractions require a concrete customer, regulatory, contractual, or blast-radius need. At every tier, build only what the current acceptance criteria and known risks require. `engineering.tier` is set once for the repository and describes the product, not the item.

### Injected evidence when an agent starts

A fresh agent should not spend its first ten tool calls working out where it is. Where the host
supports it ([`hooks/inject.mjs`](hooks/inject.mjs)), a spawned agent's context already contains the
item's state digest — and, by role, fresh mechanical check results and the diff.

`SubagentStart` is the primary event: it exists on both Claude Code and Codex, and it injects into
the *subagent's* context rather than the parent's. Claude Code additionally fires `PostToolUse` for
the `Skill` tool, so skill-load injection works there as a supplement; Codex has no skill lifecycle
event at all.

| spawned as | receives |
|---|---|
| `pipeline-planner` | the state digest |
| `pipeline-builder` | digest + check results, marked as a pre-edit baseline |
| `pipeline-reviewer` | digest + check results + the item diff |

**This runs `checks.preSpawn` (or `verify`) as a shell command.** A hook executes directly, so it is
not covered by the host's tool-permission prompts: whatever that line contains runs when an agent
starts. Point it only at commands the repository owns, and review changes to it as you would a CI
workflow.

| Env var | Default | Effect |
|---|---|---|
| `PIPELINE_SKILL_INJECT` | unset | `off` disables injection entirely — no check run, no diff, no digest |
| `PIPELINE_CHECK_TIMEOUT_MS` | `45000` | check-command timeout; on timeout the last cached result is injected, marked `STALE` |
| `PIPELINE_INJECT_MAX_LINES` | `300` | per-section truncation (60 on Codex, which truncates injected context at roughly 1k tokens) |

Check results are stamped with the commit (and dirty flag) they ran on, so an agent can tell a
pre-edit baseline from a completion gate. Every failure degrades to silence — a spawn never breaks
on this hook.

### Steer skills with project rules

The skills are deliberately generic — repo-specific knowledge (test layout, where code lives, type conventions, component budget, reuse-before-build, security policy) lives in **rules**, not in forks of the skills. `pipeline.config.yml` exposes a fixed set of optional rule **slots**; point a slot at a markdown file and the skills that consult that slot read it as **binding** guidance (a project rule overrides the skill's generic advice on conflict). Leave a slot null and skills skip it.

```yaml
rules:
  code: .pipeline/rules/typescript.md       # → write-code, architecture, architecture-critique, review
  testing: .pipeline/rules/testing.md       # → write-tests, architecture, architecture-critique, review, pipeline
  design-system: .pipeline/rules/design.md  # → design, write-code, review
  security: .pipeline/rules/security.md     # → architecture, architecture-critique, write-code, review
```

Rule files live under `.pipeline/rules/` so every host reads the same ones — nothing about them is Claude-, Cursor-, or Codex-specific. They are maintainer-authored and committed: `/setup` writes them with your approval, and a pipeline run may not edit them (the orchestrator owns `.pipeline/work/<id>/` and nothing else under `.pipeline/`).

| Slot | Read by | Use it for |
|---|---|---|
| `code` | write-code, architecture, architecture-critique, review | language / type / style conventions |
| `testing` | write-tests, architecture, architecture-critique, review, pipeline | what counts as a test, layout, lanes/fixtures |
| `architecture` | architecture, architecture-critique, write-code, review | architecture invariants & conventions |
| `taste` | refine, program-design, pipeline | standing conventions for how this repo likes things done |
| `design-system` | design, write-code, review | component budget, tokens, reuse-before-build, promotion |
| `frontend` | design, write-code, review | client / UI conventions |
| `visual` | design, review | visual fidelity / regression policy |
| `aesthetics` | design | aesthetic quality bar |
| `security` | architecture, architecture-critique, write-code, review | security policy / threat model |
| `docs` | write-docs, review | documentation voice & conventions |

This is how one repo makes `/review` enforce its own reuse-before-build rule, or `/write-tests` follow its real-vs-mock lane policy, while another repo running the same plugin does something different — same skills, different rules. See [`pipeline.config.example.yml`](pipeline.config.example.yml) for the full slot list.

## The skills

`refine` · `program-design` · `design` · `architecture` · `architecture-critique` · `write-tests` · `write-code` · `write-docs` · `review` · `retro` · `ship` · `compound` · `lore` · `setup` · `work-planning` · `pipeline`

Run an item end to end with `/pipeline <id>`. After several items, run `/compound` to mine the retro log for recurring patterns and propose process fixes. Use `/lore` anytime to capture or surface tribal knowledge.

## License

[Apache-2.0](LICENSE).
