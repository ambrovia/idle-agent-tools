#!/usr/bin/env bash
set -euo pipefail

# Install Pipeline's Codex subagent roles into a target project.
# Usage: scripts/install-codex.sh [project-root]

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../idle-skills" && pwd)"
TARGET_ROOT="${1:-$(pwd)}"
TARGET_ROOT="$(cd "$TARGET_ROOT" && pwd)"

CODEX_DIR="$TARGET_ROOT/.codex"
AGENTS_DIR="$CODEX_DIR/agents"
CONFIG_FILE="$CODEX_DIR/config.toml"
mkdir -p "$AGENTS_DIR"

for name in pipeline-planner pipeline-reviewer pipeline-builder; do
  cp "$PLUGIN_ROOT/.codex/agents/$name.toml" "$AGENTS_DIR/$name.toml"
done

touch "$CONFIG_FILE"

START_MARKER="# BEGIN agent-skills-pipeline codex agents"
END_MARKER="# END agent-skills-pipeline codex agents"
BLOCK="$(cat <<'EOF'
# BEGIN agent-skills-pipeline codex agents
[agents.pipeline-planner]
description = "Pipeline planning persona for concept, design, and architecture planning."
config_file = "./agents/pipeline-planner.toml"

[agents.pipeline-reviewer]
description = "Pipeline review persona for critiques and read-only implementation review."
config_file = "./agents/pipeline-reviewer.toml"

[agents.pipeline-builder]
description = "Pipeline build persona for tests, implementation, fixes, and shipping."
config_file = "./agents/pipeline-builder.toml"
# END agent-skills-pipeline codex agents
EOF
)"

python3 - "$CONFIG_FILE" "$START_MARKER" "$END_MARKER" "$BLOCK" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
start = sys.argv[2]
end = sys.argv[3]
block = sys.argv[4]
text = path.read_text()

if start in text and end in text:
    before, rest = text.split(start, 1)
    _, after = rest.split(end, 1)
    text = before.rstrip() + "\n\n" + block + after
else:
    text = text.rstrip()
    if text:
        text += "\n\n"
    text += block + "\n"

path.write_text(text)
PY

printf 'Installed Pipeline Codex agents into %s\n' "$CODEX_DIR"
