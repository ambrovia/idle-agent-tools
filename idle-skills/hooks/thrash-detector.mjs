#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const EDIT_TOOL = /edit|write|patch|replace|create|notebook/i;
const NO_PROGRESS = /\b(error|failed|failure|timed? out|exception|rejected|cannot|unable|no changes?|unchanged|not found|no match)\b/i;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function pick(payload, keys) {
  for (const key of keys) if (payload?.[key] !== undefined) return payload[key];
  return undefined;
}

export function normalizeEvent(payload) {
  const tool = String(pick(payload, ["tool_name", "toolName", "tool"]) ?? "");
  const action = pick(payload, ["tool_input", "toolInput", "parameters", "input"]);
  if (!EDIT_TOOL.test(tool) || action === undefined) return null;

  const result = pick(payload, ["tool_response", "toolResponse", "result", "output"]);
  const status = String(pick(payload, ["status", "tool_status", "toolStatus"]) ?? "");
  const exitCode = pick(payload, ["exit_code", "exitCode"]);
  const resultText = typeof result === "string" ? result : JSON.stringify(result ?? "");
  return {
    action: hash({ tool: tool.toLowerCase(), action }),
    result: result === undefined ? null : hash(result),
    stalled: result === undefined || /error|fail/i.test(status) || (typeof exitCode === "number" && exitCode !== 0) || NO_PROGRESS.test(resultText),
  };
}

export function detectThrash(records, event) {
  if (!event.stalled) return { kind: null, records: [] };
  const next = [...records, event].slice(-4);
  const repeated = next.slice(-3);
  if (repeated.length === 3 && repeated.every((item) => item.action === event.action && item.result === event.result)) {
    return { kind: event.result === null ? "cautious-repeat" : "exact-repeat", records: next };
  }
  if (
    next.length === 4
    && next[0].action === next[2].action && next[0].result === next[2].result
    && next[1].action === next[3].action && next[1].result === next[3].result
    && (next[0].action !== next[1].action || next[0].result !== next[1].result)
  ) return { kind: "oscillation", records: next };
  return { kind: null, records: next };
}

export function messageFor(kind) {
  if (kind === "cautious-repeat") return "The same edit repeated three times. Check whether it made progress before trying it again.";
  return "This edit pattern is repeating without progress. Inspect the failure and change strategy before editing again.";
}

function formatMessage(format, message) {
  if (format === "cursor") return { additional_context: message };
  if (format === "gemini") return { hookSpecificOutput: { additionalContext: message } };
  if (format === "copilot") return { additionalContext: message };
  return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message } };
}

function main() {
  const format = process.argv[2] ?? "claude";
  if (format === "codex") return;
  const payload = JSON.parse(readFileSync(0, "utf8"));
  if (pick(payload, ["agent_id", "agentId"])) return;
  const event = normalizeEvent(payload);
  if (!event) return;

  const directory = process.env.PIPELINE_THRASH_STATE
    ?? join(process.env.CLAUDE_PLUGIN_DATA || process.env.TMPDIR || "/tmp", "agent-pipeline-thrash");
  const session = hash(String(pick(payload, ["session_id", "sessionId", "conversation_id"]) ?? "default"));
  const path = join(directory, `${session}.json`);
  mkdirSync(directory, { recursive: true });
  let records = [];
  try { records = JSON.parse(readFileSync(path, "utf8")); } catch { /* first event */ }
  const detection = detectThrash(records, event);
  writeFileSync(path, `${JSON.stringify(detection.records)}\n`);
  if (detection.kind) process.stdout.write(`${JSON.stringify(formatMessage(format, messageFor(detection.kind)))}\n`);
}

try {
  if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
} catch {
  // A guard must never break an edit.
}
