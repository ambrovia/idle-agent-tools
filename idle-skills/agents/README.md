# Persona agents — one source, generated per harness

Three personas (`pipeline-planner`, `pipeline-reviewer`, `pipeline-builder`) drive the pipeline's
producer/evaluator separation. They are authored ONCE in `../personas/<name>.md`
(neutral frontmatter + the prompt body) and **generated** into each harness's
dialect by `../scripts/generate-agents.mjs`. Every generated file carries a
`GENERATED … do not edit` marker — edit `personas/` and regenerate, never the
outputs. Skills (`../skills/`) are neutral `SKILL.md` and need no generation —
every harness reads that format directly.

## Canonical source — `personas/<name>.md`

Frontmatter is harness-neutral; the generator maps it to each tool's dialect:

| Field | Meaning |
|---|---|
| `capability` | `high` (pipeline-planner, pipeline-reviewer) or `fast` (pipeline-builder) |
| `write` / `edit` / `bash` | tool policy (read / grep / glob are always on) |

## Generated outputs

| Harness | File | Frontmatter the generator emits | Skills location |
|---|---|---|---|
| **Claude Code** | `agents/*.md` (registered in `.claude-plugin/plugin.json`) | `tools` PascalCase string + `model` real id (`opus` / `sonnet`) | `skills` field → `./skills` |
| **Cursor** | `agents-cursor/*.md` (registered in `.cursor-plugin/plugin.json`) | `model: inherit`; `readonly: true` when write+edit are false | `skills` field → `./skills` |
| **opencode** | `.opencode/agents/*.md` | `mode: subagent` + `tools` deny-map; `model` omitted (inherit) | `.opencode/skills/` (install-time copy) |
| **Codex** | `.codex/agents/*.toml` + `.codex/config.toml` | `name` / `description` / `model` / `developer_instructions`; `model_reasoning_effort: high` for high-capability | `.codex-plugin/plugin.json` -> `./skills` |

Codex has native TOML subagents, but they are registered through
`.codex/config.toml`; the TOML files alone are inert. The plugin manifest exposes
skills/hooks and the plugin-level `agents/openai.yaml` metadata, while real
subagent roles must be copied into the target project by
`scripts/install-codex.sh`.

## Changing a persona

1. Edit `personas/<name>.md` — the body and/or the neutral frontmatter.
2. Run `node scripts/generate-agents.mjs` to regenerate all twelve outputs
   (3 personas × 4 harnesses).
3. Commit `personas/` and the regenerated files together.

CI / pre-commit guard: `node scripts/generate-agents.mjs --check` exits non-zero
if any generated file is stale, so the copies cannot silently drift.

## Harness notes

- **Claude:** `tools` MUST be a PascalCase comma string and `model` a real Claude
  id — lowercase array tools match zero tools (silent no-op) and abstract tiers
  (`high` / `fast`) are not valid model ids (spawn errors). The generator enforces both.
- **Cursor:** plugin manifest at `.cursor-plugin/plugin.json` registers skills,
  `agents-cursor/*.md` (`model: inherit`, no `tools`; `readonly: true` on
  pipeline-reviewer), and `hooks/cursor-hooks.json` (uses `${CURSOR_PLUGIN_ROOT}`
  for script paths). Install via Team Marketplace import, `scripts/install-cursor.sh`,
  or manual copy.
- **opencode:** the loader globs `{agent,agents}`, so the plural `.opencode/agents/`
  used here loads fine (the old singular/plural silent-no-load is fixed on current versions).
- **Codex:** project files in `.codex/agents/` load only when the project is trusted
  and registered in `.codex/config.toml`. Run `scripts/install-codex.sh <project>`
  to install them as `pipeline-planner`, `pipeline-reviewer`, and `pipeline-builder`
  roles. The Codex plugin manifest has no subagent-role field, so plugin installation
  alone cannot create those roles.

After regenerating Claude agents, reinstall/update the plugin so the cache copy
(`~/.claude/plugins/cache/idle-agent-tools/idle-skills/.../agents/`) picks up the change, and
restart the session — Claude loads agent definitions once at startup.
