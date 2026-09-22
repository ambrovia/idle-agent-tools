import assert from "node:assert/strict";
import test from "node:test";

import { detectThrash, normalizeEvent } from "../idle-skills/hooks/thrash-detector.mjs";

const edit = (input, output, extra = {}) => ({
  tool_name: "Edit",
  tool_input: input,
  ...(output === undefined ? {} : { tool_response: output }),
  ...extra,
});

test("ignores non-edit tools", () => {
  assert.equal(normalizeEvent({ tool_name: "Read", tool_input: { file: "a" } }), null);
});

test("three distinct edits do not warn", () => {
  let records = [];
  for (const name of ["a", "b", "c"]) {
    const event = normalizeEvent(edit({ file: name }, "updated"));
    const result = detectThrash(records, event);
    records = result.records;
    assert.equal(result.kind, null);
  }
});

test("a successful result resets an earlier failure recurrence", () => {
  const failed = normalizeEvent(edit({ file: "a" }, "error: no match"));
  const success = normalizeEvent(edit({ file: "a" }, "updated successfully"));
  let records = detectThrash([], failed).records;
  records = detectThrash(records, failed).records;
  const reset = detectThrash(records, success);
  assert.equal(reset.kind, null);
  assert.deepEqual(reset.records, []);
  assert.equal(detectThrash(reset.records, failed).kind, null);
});

test("three identical actions and results report exact repeat", () => {
  let records = [];
  let kind = null;
  for (let i = 0; i < 3; i += 1) {
    const result = detectThrash(records, normalizeEvent(edit({ file: "a", old: "x", new: "y" }, "error: no match")));
    records = result.records;
    kind = result.kind;
  }
  assert.equal(kind, "exact-repeat");
});

test("result-free repeats produce only the cautious signal", () => {
  let records = [];
  let kind = null;
  for (let i = 0; i < 3; i += 1) {
    const result = detectThrash(records, normalizeEvent(edit({ file: "a", old: "x", new: "y" })));
    records = result.records;
    kind = result.kind;
  }
  assert.equal(kind, "cautious-repeat");
});

test("failed A-B-A-B reports oscillation, successful A-B-A-B does not", () => {
  for (const failed of [true, false]) {
    let records = [];
    let kind = null;
    for (const file of ["a", "b", "a", "b"]) {
      const output = failed ? "failed: unchanged" : "updated";
      const result = detectThrash(records, normalizeEvent(edit({ file }, output)));
      records = result.records;
      kind = result.kind;
    }
    assert.equal(kind, failed ? "oscillation" : null);
  }
});
