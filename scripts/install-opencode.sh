#!/usr/bin/env bash
#
# install-opencode.sh — install idle-skills into a project (or globally)
# for opencode.
#
# opencode plugins are JavaScript/TypeScript modules. Skills, agents, and rules
# are still file-based configuration, so this script drops each pipeline piece
# where opencode looks.
#
#   skills  → .opencode/skills/    (opencode's own skill dir — self-contained,
#                                    no dependency on .claude/ or shared .agents/)
#   agents  → .opencode/agents/    (opencode-format pipeline-planner / pipeline-reviewer / pipeline-builder)
#   plugin  → .opencode/plugins/   (post-edit guards)
#   helpers → .opencode/pipeline/   (skill-load injection the plugin shells out
#                                    to; kept out of plugins/ because opencode
#                                    loads that dir as modules)
#   rules   → AGENTS.md            (session-start "pipeline is active" guidance)
#   record  → opencode.json        (the idle-tasks MCP server, started from npm)
#             + the idle skill, which says how the record of work is used
#
# Usage:
#   scripts/install-opencode.sh [target-dir]   # project install (default: cwd)
#   scripts/install-opencode.sh --global       # install into ~/.config/opencode
#   scripts/install-opencode.sh --help
#
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

GLOBAL=0
TARGET="$(pwd)"
for arg in "$@"; do
  case "$arg" in
    --global) GLOBAL=1 ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed 's/^#\{1,\} \{0,1\}//; /^set -euo/d'; exit 0 ;;
    -*) echo "unknown flag: $arg" >&2; exit 2 ;;
    *)  TARGET="$arg" ;;
  esac
done

if [ "$GLOBAL" -eq 1 ]; then
  SKILLS_DIR="$HOME/.config/opencode/skills"
  AGENTS_DIR="$HOME/.config/opencode/agents"
  PLUGINS_DIR="$HOME/.config/opencode/plugins"
  HELPERS_DIR="$HOME/.config/opencode/pipeline"
  RULES_FILE="$HOME/.config/opencode/AGENTS.md"
  CONFIG_FILE="$HOME/.config/opencode/opencode.json"
  SCOPE="global (~/.config/opencode)"
else
  SKILLS_DIR="$TARGET/.opencode/skills"
  AGENTS_DIR="$TARGET/.opencode/agents"
  PLUGINS_DIR="$TARGET/.opencode/plugins"
  HELPERS_DIR="$TARGET/.opencode/pipeline"
  RULES_FILE="$TARGET/AGENTS.md"
  CONFIG_FILE="$TARGET/opencode.json"
  SCOPE="project ($TARGET)"
fi

echo "Installing idle-skills for opencode → $SCOPE"

# 1. Skills — one per directory, each with a SKILL.md.
mkdir -p "$SKILLS_DIR"
cp -R "$SRC/skills/." "$SKILLS_DIR/"
cp -R "$SRC/tasks/skills/." "$SKILLS_DIR/"
echo "  ✓ skills   → $SKILLS_DIR"

# 1b. The record of work — the idle-tasks MCP server, merged into opencode.json.
node - "$CONFIG_FILE" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
let config = {};
try { config = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) {
  if (err.code !== 'ENOENT') { console.error(`  ! ${file} is not plain JSON — add the idle MCP server by hand`); process.exit(0); }
}
config.$schema ??= 'https://opencode.ai/config.json';
config.mcp = { ...config.mcp, idle: { type: 'local', command: ['npx', '-y', 'idle-agent-tasks@0.1', 'mcp'], enabled: true } };
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
NODE
echo "  ✓ record   → $CONFIG_FILE (mcp.idle)"

# 2. Agents — opencode-format pipeline-planner / pipeline-reviewer / pipeline-builder.
mkdir -p "$AGENTS_DIR"
cp "$SRC/.opencode/agents/"*.md "$AGENTS_DIR/"
echo "  ✓ agents   → $AGENTS_DIR"

# 3. Plugin — post-edit guards.
mkdir -p "$PLUGINS_DIR"
cp "$SRC/.opencode/plugins/pipeline.js" "$PLUGINS_DIR/"
echo "  ✓ plugin   → $PLUGINS_DIR/pipeline.js"

# 4. Helpers the plugin shells out to. Not in plugins/ — opencode imports every
#    module there, and these are executables with their own entry points.
mkdir -p "$HELPERS_DIR"
cp "$SRC/hooks/inject.mjs" "$HELPERS_DIR/"
echo "  ✓ helpers  → $HELPERS_DIR"

# 5. Session-start guidance — an idempotent managed block in AGENTS.md.
#    (Canonical text lives in hooks/session-start.sh; kept in sync here.)
BEGIN="<!-- agent-pipeline:begin -->"
END="<!-- agent-pipeline:end -->"
read -r -d '' BLOCK <<EOF || true
$BEGIN
## idle-skills

idle-skills is active. Work in structured phases, not freeform.

- Large or non-trivial changes: drop a task with the idle skill, then run it through the
  pipeline skill, which refines and plans it with the user. Don't freelance big changes.
- Conceptual questions (what a thing IS or should be): use the concept skill, and
  resolve them interactively with the user — don't settle load-bearing meaning alone.
- Structured work uses three dedicated agents; you are the orchestrator, delegate
  work to your team: @pipeline-planner (concept/design/architecture) plans & structures
  details; @pipeline-builder implements & ships and thus does the heavy lifting; @pipeline-reviewer
  critiques and reviews.
$END
EOF

mkdir -p "$(dirname "$RULES_FILE")"
touch "$RULES_FILE"
# Strip any prior block, then append the current one.
tmp="$(mktemp)"
awk -v b="$BEGIN" -v e="$END" '$0==b{s=1} !s{print} $0==e{s=0}' "$RULES_FILE" > "$tmp"
# Collapse trailing blank lines from the stripped file, then append.
{ sed -e :a -e '/^\n*$/{$d;N;ba}' "$tmp" 2>/dev/null || cat "$tmp"; printf '\n%s\n' "$BLOCK"; } > "$RULES_FILE"
rm -f "$tmp"
echo "  ✓ guidance → $RULES_FILE (AGENTS.md block)"

cat <<EOF

Done. Open the target project in opencode and restart it.
  • skills surface via the skill tool
  • personas are available as @pipeline-planner, @pipeline-reviewer, @pipeline-builder
  • post-edit guards and skill-load injection load from the plugin automatically

To pin models, set 'model: <provider>/<id>' in the agent files under $AGENTS_DIR.
EOF
