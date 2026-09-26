#!/usr/bin/env bash
#
# install-cursor.sh — install idle-skills for Cursor.
#
# Cursor 2.5+ loads plugins from ~/.cursor/plugins/local/ (IDE) or from a
# Team Marketplace import (Teams/Enterprise). This script supports:
#
#   1. Plugin install (default) — copy both plugins into ~/.cursor/plugins/local/
#      so Cursor discovers skills, agents, and hooks via .cursor-plugin/plugin.json.
#
#   2. Project copy (--project) — copy skills/agents/hooks into a project's
#      .cursor/ tree. Use when you need Cursor CLI compatibility or cannot use
#      the plugin loader.
#
# Usage:
#   scripts/install-cursor.sh                    # plugin copy (global IDE)
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
  # Cursor skips a symlink that points outside plugins/local, so each plugin is copied —
  # only what its manifest names. Re-run after an update.
  copy_plugin() { # name, source root, paths…
    local name="$1" root="$2" dest="$LOCAL_PLUGINS/$1"; shift 2
    if [ -e "$dest" ] && [ ! -L "$dest" ] && [ ! -f "$dest/.cursor-plugin/plugin.json" ]; then
      echo "refusing to overwrite $dest: not a Cursor plugin" >&2
      exit 1
    fi
    rm -rf "$dest" && mkdir -p "$dest"
    for path in "$@"; do cp -R "$root/$path" "$dest/$path"; done
    find "$dest" -type d -name node_modules -prune -exec rm -rf {} +
    echo "Installed $name as a local Cursor plugin: $dest"
  }
  copy_plugin idle-skills "$SRC/idle-skills" .cursor-plugin skills agents-cursor hooks
  copy_plugin idle-tasks "$SRC/idle-tasks" .cursor-plugin skills
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
cp -R "$SRC/idle-skills/skills/." "$SKILLS_DIR/"
cp -R "$SRC/idle-tasks/skills/." "$SKILLS_DIR/"
cp "$SRC/idle-skills/agents-cursor/"*.md "$AGENTS_DIR/"
cp "$SRC/idle-skills/hooks/session-start.sh" "$SRC/idle-skills/hooks/edit-streak.sh" "$SRC/idle-skills/hooks/thrash-detector.mjs" \
   "$SRC/idle-skills/hooks/inject.mjs" "$HOOKS_DIR/"
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
config.mcpServers = { ...config.mcpServers, idle: { command: 'npx', args: ['-y', 'idle-agent-tasks@0.1.3', 'mcp'] } };
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
NODE

echo "  ✓ skills → $SKILLS_DIR"
echo "  ✓ record → $TARGET/.cursor/mcp.json (mcpServers.idle)"
echo "  ✓ agents → $AGENTS_DIR"
echo "  ✓ hooks  → $HOOKS_FILE"
echo ""
echo "Restart Cursor or run Developer: Reload Window."
