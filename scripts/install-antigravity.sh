#!/usr/bin/env bash
#
# install-antigravity.sh — install idle-skills and idle-tasks as global
# Antigravity plugins (the IDE and the `agy` CLI both read them).
#
# Antigravity copies the whole directory it is pointed at, so each plugin is
# staged first with only what Antigravity reads:
#
#   idle-tasks   plugin.json, mcp_config.json (the record of work, from npm), skills/
#   idle-skills  plugin.json, skills/, agents/ (the personas, from agents-antigravity/)
#
# Destination: ~/.gemini/config/plugins/<name>
#
# Usage:
#   scripts/install-antigravity.sh
#   scripts/install-antigravity.sh --help
#
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HOME/.gemini/config/plugins"

for arg in "$@"; do
  case "$arg" in
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed 's/^#\{1,\} \{0,1\}//; /^set -euo/d'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/idle-tasks" "$STAGE/idle-skills/agents"
cp "$SRC/tasks/plugin.json" "$SRC/tasks/mcp_config.json" "$STAGE/idle-tasks/"
cp -R "$SRC/tasks/skills" "$STAGE/idle-tasks/skills"
cp "$SRC/plugin.json" "$STAGE/idle-skills/"
cp -R "$SRC/skills" "$STAGE/idle-skills/skills"
cp "$SRC/agents-antigravity/"pipeline-*.md "$STAGE/idle-skills/agents/"
# A skill may carry a locally installed node_modules; that is not part of the plugin.
find "$STAGE" -type d -name node_modules -prune -exec rm -rf {} +

echo "Installing idle-tasks and idle-skills for Antigravity → $DEST"
for name in idle-tasks idle-skills; do
  rm -rf "${DEST:?}/$name"
  if command -v agy >/dev/null 2>&1; then
    agy plugin install "$STAGE/$name" >/dev/null
  else
    mkdir -p "$DEST" && cp -R "$STAGE/$name" "$DEST/$name"
  fi
  echo "  ✓ $name → $DEST/$name"
done

echo ""
echo "Restart Antigravity. Skills surface as idle-skills:<name> and idle-tasks:idle;"
echo "the record of work is the MCP server \"idle\"."
