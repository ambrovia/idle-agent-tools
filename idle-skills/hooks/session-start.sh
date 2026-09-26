#!/bin/bash
# idle-skills session-start hook — surface how to work in this repo.
# Usage: session-start.sh [claude|cursor|gemini|codex|copilot]   (default: claude)
# Each tool wants the injected context in a different output shape. Keep this
# script dependency-free because session-start hooks must always emit valid JSON.
# @lore: Codex 0.142.5 — SessionStart hook stdout marked failed, any JSON shape; keep codex output empty
fmt="${1:-claude}"

MSG_JSON='idle-skills is active. Work in structured phases, not freeform.\n\n- Large or non-trivial changes: drop a task in the record of work (/idle), then run\n  it through /pipeline, which refines and plans it with the user. Don'\''t freelance big changes.\n- Conceptual questions (what a thing IS or should be): use /refine, and resolve\n  them interactively with the user - don'\''t settle load-bearing meaning alone.\n- Structured work uses three dedicated agents; you are the orchestrator, delegate\n  work to your team: pipeline-planner (concept/design/architecture) plans & structures\n  details; pipeline-builder implements & ships and thus does the heavy lifting; pipeline-reviewer\n  critiques and reviews.'

case "$fmt" in
  cursor)  printf '{"additional_context":"%s"}\n' "$MSG_JSON" ;;
  gemini)  printf '{"hookSpecificOutput":{"additionalContext":"%s"}}\n' "$MSG_JSON" ;;
  codex)   exit 0 ;;
  copilot) printf '{"additionalContext":"%s"}\n' "$MSG_JSON" ;;
  *)       printf '{"priority":"IMPORTANT","message":"%s"}\n' "$MSG_JSON" ;;  # claude / default
esac
