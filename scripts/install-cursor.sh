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
PLUGIN_NAME="pipeline"
PLUGIN_LINK="$HOME/.cursor/plugins/local/$PLUGIN_NAME"

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
  mkdir -p "$HOME/.cursor/plugins/local"
  if [ -e "$PLUGIN_LINK" ] && [ ! -L "$PLUGIN_LINK" ]; then
    echo "refusing to overwrite existing non-symlink: $PLUGIN_LINK" >&2
    exit 1
  fi
  ln -sfn "$SRC" "$PLUGIN_LINK"
  echo "Installed idle-skills as a local Cursor plugin:"
  echo "  $PLUGIN_LINK -> $SRC"
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
cp "$SRC/agents-cursor/"*.md "$AGENTS_DIR/"
cp "$SRC/hooks/session-start.sh" "$SRC/hooks/edit-streak.sh" "$SRC/hooks/thrash-detector.mjs" \
   "$SRC/hooks/inject.mjs" "$HOOKS_DIR/"
# inject shells out to the snapshot; keep it beside the hook.
cp "$SRC/scripts/pipeline-snapshot.mjs" "$HOOKS_DIR/"
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

echo "  ✓ skills → $SKILLS_DIR"
echo "  ✓ agents → $AGENTS_DIR"
echo "  ✓ hooks  → $HOOKS_FILE"
echo ""
echo "Restart Cursor or run Developer: Reload Window."
