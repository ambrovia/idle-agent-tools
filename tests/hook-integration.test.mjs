import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { AgentPipeline } from "../idle-skills/.opencode/plugins/pipeline.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const guard = join(root, "idle-skills/hooks/thrash-detector.mjs");
const editStreak = join(root, "idle-skills/hooks/edit-streak.sh");

const fixture = (session = "session") => JSON.stringify({
  session_id: session,
  tool_name: "Edit",
  tool_input: { file_path: "src/a.ts", old_string: "x", new_string: "y" },
  tool_response: "error: old_string not found",
});

function invokeGuard(format, state, input = fixture()) {
  return spawnSync(process.execPath, [guard, format], {
    cwd: root,
    input,
    encoding: "utf8",
    env: { ...process.env, PIPELINE_THRASH_STATE: state },
  });
}

test("edit streak remains a separate delegation hook", () => {
  const state = mkdtempSync(join(tmpdir(), "pipeline-streak-"));
  let result;
  for (let index = 0; index < 5; index += 1) {
    result = spawnSync("bash", [editStreak, "claude"], {
      input: fixture("streak"), encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_DATA: state },
    });
  }
  assert.match(result.stdout, /delegate to your team/);
});

for (const [format, matches] of [
  ["claude", (value) => value.hookSpecificOutput?.hookEventName === "PostToolUse"],
  ["cursor", (value) => typeof value.additional_context === "string"],
  ["gemini", (value) => typeof value.hookSpecificOutput?.additionalContext === "string"],
  ["copilot", (value) => typeof value.additionalContext === "string"],
]) {
  test(`${format} thrash hook emits its host envelope`, () => {
    const state = mkdtempSync(join(tmpdir(), `pipeline-${format}-`));
    assert.equal(invokeGuard(format, state).stdout, "");
    assert.equal(invokeGuard(format, state).stdout, "");
    const third = invokeGuard(format, state);
    assert.equal(third.status, 0);
    assert(matches(JSON.parse(third.stdout)));
  });
}

test("thrash hook fails open", () => {
  const state = mkdtempSync(join(tmpdir(), "pipeline-malformed-"));
  const result = invokeGuard("cursor", state, "not json");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("opencode retains edit streak and adds thrash warning", async () => {
  const plugin = await AgentPipeline();
  let final = "";
  for (let index = 0; index < 5; index += 1) {
    const input = { tool: "edit", sessionID: "s" };
    const output = { output: "error: no match" };
    await plugin["tool.execute.after"](input, output);
    final = output.output;
  }
  assert.match(final, /delegate to your team/);
  assert.match(final, /repeating without progress/);
});

test("installers package the separate thrash hook", async () => {
  const cursorTarget = mkdtempSync(join(tmpdir(), "pipeline-cursor-install-"));
  assert.equal(spawnSync("bash", [join(root, "scripts/install-cursor.sh"), cursorTarget]).status, 0);
  assert(statSync(join(cursorTarget, ".cursor/hooks/edit-streak.sh")).isFile());
  assert(statSync(join(cursorTarget, ".cursor/hooks/thrash-detector.mjs")).isFile());
  assert.match(readFileSync(join(cursorTarget, ".cursor/hooks.json"), "utf8"), /thrash-detector/);

  const openTarget = mkdtempSync(join(tmpdir(), "pipeline-open-install-"));
  assert.equal(spawnSync("bash", [join(root, "scripts/install-opencode.sh"), openTarget]).status, 0);
  const module = await import(`${pathToFileURL(join(openTarget, ".opencode/plugins/pipeline.js")).href}?test=${Date.now()}`);
  assert.equal(typeof module.AgentPipeline, "function");
});
