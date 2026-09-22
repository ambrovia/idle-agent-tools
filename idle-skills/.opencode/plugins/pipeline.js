/**
 * idle-skills — opencode plugin.
 *
 * Ports the "edit-streak" hook: after THRESHOLD code edits the orchestrator is
 * nudged to delegate to its pipeline-builder/pipeline-planner/pipeline-reviewer team instead of doing the
 * heavy lifting itself. The nudge is appended to the edit tool's result, which
 * opencode surfaces to the model on its next turn (verified against the
 * `@opencode-ai/plugin` `tool.execute.after` signature: `output.output` is the
 * mutable result string the model reads).
 *
 * The other half of the Claude hooks — the session-start "pipeline is active"
 * guidance — is NOT a plugin here. opencode plugins only expose tool/chat
 * lifecycle hooks, with no stable way to inject standing context once per
 * session; opencode's documented mechanism for that is the AGENTS.md rules file.
 * `scripts/install-opencode.sh` writes that guidance into AGENTS.md.
 *
 * Caveat (matches the Cursor/Gemini/Codex/Copilot ports): opencode does not
 * expose an orchestrator/subagent distinction at the tool layer, so — unlike
 * Claude, which skips edits made inside a subagent — this can't tell whether an
 * edit came from the orchestrator or from the pipeline-builder. The nudge is best-effort
 * and may also fire inside a subagent.
 *
 * Also ports the skill-load injection hook: when a pipeline skill loads, fresh
 * check results, the WP diff, and critiqued artifacts are appended to the skill
 * tool's result (logic lives in hooks/inject.mjs; see that guard).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const THRESHOLD = 5;
const EDIT_TOOLS = /^(edit|write|patch|multiedit|notebookedit)$/i;
const SKILL_TOOL = /^skill$/i;
// opencode reports no skill name on the tool input, so it is read back out of
// the rendered skill result — the only handle available. Fails closed.
const SKILL_NAME = /<skill_content name="([\w-]+)"/;
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
// Repo and npm layouts keep the hook under hooks/; a project install has only
// .opencode/, so install-opencode.sh drops it in .opencode/pipeline/ — beside
// plugins/ rather than inside it, since opencode loads plugins/ as modules.
const INJECT_HOOK = [
  join(PLUGIN_DIR, "..", "..", "hooks", "inject.mjs"),
  join(PLUGIN_DIR, "..", "pipeline", "inject.mjs"),
].find((path) => existsSync(path));
const NO_PROGRESS = /\b(error|failed|failure|timed? out|exception|rejected|cannot|unable|no changes?|unchanged|not found|no match)\b/i;

// sessionID -> count of edits since the last nudge. Module scope persists for
// the lifetime of the opencode process.
const streak = new Map();
const failures = new Map();

export const AgentPipeline = async () => {
  return {
    "tool.execute.after": async (input, output) => {
      try {
        if (INJECT_HOOK && input && SKILL_TOOL.test(input.tool || "") && typeof output?.output === "string") {
          const name = (output.output.slice(0, 500).match(SKILL_NAME) || [])[1];
          if (name) {
            const injected = spawnSync(process.execPath, [INJECT_HOOK, "opencode", name], {
              cwd: process.cwd(), encoding: "utf8", timeout: 60_000,
            });
            if (injected.status === 0 && injected.stdout.trim()) {
              output.output += `\n\n---\n${injected.stdout.trim()}`;
            }
          }
          return;
        }

        if (!input || !EDIT_TOOLS.test(input.tool || "")) return;

        const sid = input.sessionID || "default";
        const n = (streak.get(sid) || 0) + 1;
        const toolResult = output?.output;

        if (n < THRESHOLD) {
          streak.set(sid, n);
        } else {
          streak.set(sid, 0);
          if (output && typeof output.output === "string") {
            output.output +=
              `\n\n---\n[idle-skills] You've made ${THRESHOLD} code edits since the last ` +
              `reminder. You're the orchestrator — delegate to your team instead of doing the ` +
              `heavy lifting yourself: the pipeline-builder implements & ships, the pipeline-planner plans & ` +
              `structures, the pipeline-reviewer reviews & critiques. Hand structured work to a subagent.`;
          }
        }

        if (typeof toolResult !== "string" || !NO_PROGRESS.test(toolResult)) {
          failures.delete(sid);
          return;
        }
        const recent = [...(failures.get(sid) || []), `${input.tool}\0${toolResult}`].slice(-3);
        failures.set(sid, recent);
        if (recent.length === 3 && recent.every((item) => item === recent[0])) {
          output.output += "\n\n---\n[idle-skills] This edit is repeating without progress. Inspect the failure and change strategy.";
        }
      } catch {
        // A nudge must never break a tool call.
      }
    },
  };
};
