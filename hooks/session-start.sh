#!/bin/bash
# agent-pipeline session-start hook — surface how to work in this repo.
# Usage: session-start.sh [claude|cursor|gemini|codex|copilot]   (default: claude)
# Each tool wants the injected context in a different output shape. Keep this
# script dependency-free because session-start hooks must always emit valid JSON.
# @lore: Codex 0.142.5 command hooks mark SessionStart stdout as failed, even for
# JSON shapes accepted by other harnesses. Keep Codex silent until its hook output
# contract supports context injection.
fmt="${1:-claude}"

MSG_JSON='agent-pipeline is active. Work in structured phases, not freeform.\n\n- Large or non-trivial changes: start with /work-planning to open a stream,\n  then run it through /pipeline. State lives in the record of work (/idle), not in files. Don'\''t freelance big changes.\n- Conceptual questions (what a thing IS or should be): use /refine, and resolve\n  them interactively with the user - don'\''t settle load-bearing meaning alone.\n- Structured work uses three dedicated agents; you are the orchestrator, delegate\n  work to your team: pipeline-planner (concept/design/architecture) plans & structures\n  details; pipeline-builder implements & ships and thus does the heavy lifting; pipeline-reviewer\n  critiques and reviews.'

case "$fmt" in
  cursor)  printf '{"additional_context":"%s"}\n' "$MSG_JSON" ;;
  gemini)  printf '{"hookSpecificOutput":{"additionalContext":"%s"}}\n' "$MSG_JSON" ;;
  codex)   exit 0 ;;
  copilot) printf '{"additionalContext":"%s"}\n' "$MSG_JSON" ;;
  *)       printf '{"priority":"IMPORTANT","message":"%s"}\n' "$MSG_JSON" ;;  # claude / default
esac
