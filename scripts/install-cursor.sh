#!/usr/bin/env bash
#
# install-cursor.sh — install idle-skills for Cursor.
#
# Cursor 2.5+ loads plugins from ~/.cursor/plugins/local/ (IDE) or from a
# Team Marketplace import (Teams/Enterprise). This script supports:
#
#   1. Plugin install (default) — symlink the repo into ~/.cursor/plugins/local/
#      so Cursor discovers skills, agents, and hooks via .cursor-plugin/plugin.json.
#
#   2. Project copy (--project) — copy skills/agents/hooks into a project's
#      .cursor/ tree. Use when you need Cursor CLI compatibility or cannot use
#      the plugin loader.
#
# Usage:
#   scripts/install-cursor.sh                    # plugin symlink (global IDE)
#   scripts/install-cursor.sh /path/to/project   # project copy install
#   scripts/install-cursor.sh --project          # project copy into cwd
#   scripts/install-cursor.sh --help
#
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_PLUGINS="$HOME/.cursor/plugins/local"

MODE="plugin"
TARGET="$(pwd)"

for arg in "$@"; do
  case "$arg" in
    --project) MODE="project" ;;
    -h|--help)
      sed -n '2,/^set -euo/p' "$0" | sed 's/^#\{1,\} \{0,1\}//; /^set -euo/d'
      exit 0
      ;;
    -*) echo "unknown flag: $arg" >&2; exit 2 ;;
    *) TARGET="$arg"; MODE="project" ;;
  esac
done

if [ "$MODE" = "plugin" ]; then
  mkdir -p "$LOCAL_PLUGINS"
  # The link this installer made under the plugin's old name.
  if [ -L "$LOCAL_PLUGINS/pipeline" ]; then rm "$LOCAL_PLUGINS/pipeline"; fi
  # idle-skills is the repository root; idle-tasks — the record of work it needs — is tasks/.
  for pair in "idle-skills:$SRC" "idle-tasks:$SRC/tasks"; do
    link="$LOCAL_PLUGINS/${pair%%:*}"
    if [ -e "$link" ] && [ ! -L "$link" ]; then
      echo "refusing to overwrite existing non-symlink: $link" >&2
      exit 1
    fi
    ln -sfn "${pair#*:}" "$link"
    echo "Installed ${pair%%:*} as a local Cursor plugin:"
    echo "  $link -> ${pair#*:}"
  done
  echo ""
  echo "Restart Cursor or run Developer: Reload Window."
  echo ""
  echo "Teams/Enterprise: import the GitHub repo as a Team Marketplace instead:"
  echo "  Dashboard -> Plugins -> Team Marketplaces -> Import from Repo"
  echo "  https://github.com/ambrovia/idle-agent-tools"
  exit 0
fi

SKILLS_DIR="$TARGET/.cursor/skills"
AGENTS_DIR="$TARGET/.cursor/agents"
HOOKS_DIR="$TARGET/.cursor/hooks"
HOOKS_FILE="$TARGET/.cursor/hooks.json"

echo "Installing idle-skills for Cursor (project copy) → $TARGET"

mkdir -p "$SKILLS_DIR" "$AGENTS_DIR" "$HOOKS_DIR"
cp -R "$SRC/skills/." "$SKILLS_DIR/"
cp -R "$SRC/tasks/skills/." "$SKILLS_DIR/"
cp "$SRC/agents-cursor/"*.md "$AGENTS_DIR/"
cp "$SRC/hooks/session-start.sh" "$SRC/hooks/edit-streak.sh" "$SRC/hooks/thrash-detector.mjs" \
   "$SRC/hooks/inject.mjs" "$HOOKS_DIR/"
chmod +x "$HOOKS_DIR/session-start.sh" "$HOOKS_DIR/edit-streak.sh" "$HOOKS_DIR/thrash-detector.mjs" \
          "$HOOKS_DIR/inject.mjs"

cat > "$HOOKS_FILE" <<'EOF'
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "bash .cursor/hooks/session-start.sh cursor" }
    ],
    "postToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "command": "bash .cursor/hooks/edit-streak.sh cursor"
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "command": "node .cursor/hooks/thrash-detector.mjs cursor"
      },
      {
        "matcher": "Skill|skill",
        "command": "node .cursor/hooks/inject.mjs cursor"
      }
    ]
  }
}
EOF

# The record of work — the idle-tasks MCP server, merged into .cursor/mcp.json.
node - "$TARGET/.cursor/mcp.json" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
let config = {};
try { config = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) {
  if (err.code !== 'ENOENT') { console.error(`  ! ${file} is not plain JSON — add the idle MCP server by hand`); process.exit(0); }
}
config.mcpServers = { ...config.mcpServers, idle: { command: 'npx', args: ['-y', 'idle-agent-tasks@0.1.2', 'mcp'] } };
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
NODE

echo "  ✓ skills → $SKILLS_DIR"
echo "  ✓ record → $TARGET/.cursor/mcp.json (mcpServers.idle)"
echo "  ✓ agents → $AGENTS_DIR"
echo "  ✓ hooks  → $HOOKS_FILE"
echo ""
echo "Restart Cursor or run Developer: Reload Window."
