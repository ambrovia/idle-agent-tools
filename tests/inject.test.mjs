import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const hook = resolve(new URL('..', import.meta.url).pathname, 'idle-skills/hooks/inject.mjs');
const idleBin = resolve(new URL('..', import.meta.url).pathname, 'idle-tasks/bin/idle.mjs');

// Each fixture is a repository plus a whole PGlite database; leave none behind.
const made = [];
const homes = new Map(); // repository → the record-of-work home its fixture created
process.on('exit', () => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function git(repo, ...args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function idle(root, ...args) {
  const result = spawnSync(process.execPath, [idleBin, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...homes.get(root) },
  });
  assert.equal(result.status, 0, `idle ${args.join(' ')} failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function emptyRepo() {
  const root = mkdtempSync(join(tmpdir(), 'pipeline-inject-'));
  const home = mkdtempSync(join(tmpdir(), 'pipeline-inject-home-'));
  made.push(root, home);
  homes.set(root, { IDLE_HOME: home });
  return root;
}

function fixture({ verify = 'echo CHECKS-GREEN', archived = false, since: sinceOverride, config } = {}) {
  const root = emptyRepo();
  git(root, 'init', '-q');
  writeFileSync(join(root, 'file.txt'), 'one\n');
  git(root, 'add', 'file.txt');
  git(root, '-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'base');
  const since = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'file.txt'), 'one\ntwo\n');

  const task = idle(root, 'task', '--title', 'Demo fix', '--goal', 'The demo no longer breaks',
    '--plan', 'PLAN-MARKER what we need', '--meta', JSON.stringify({ since: sinceOverride ?? since }));
  if (archived) idle(root, 'task', '--id', task.id, '--status', 'archived');
  writeFileSync(join(root, 'pipeline.config.yml'), config ?? `verify: "${verify}"\n`);
  return { root, since, id: task.id };
}

function run(root, format, payload, env = {}) {
  const args = [hook, format];
  const input = format === 'opencode' ? undefined : JSON.stringify(payload);
  if (format === 'opencode') args.push(payload);
  return spawnSync(process.execPath, args, {
    cwd: root, input, encoding: 'utf8', env: { ...process.env, IDLE_BIN: idleBin, ...homes.get(root), ...env },
  });
}

const skillPayload = (skill) => ({ tool_name: 'Skill', tool_input: { skill } });
const spawnPayload = (agentType) => ({ hook_event_name: 'SubagentStart', agent_type: agentType });

function claudeContext(result) {
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
}

test('review skill gets state, fresh check results, and the diff', () => {
  const { root, since, id } = fixture();
  const result = run(root, 'claude', skillPayload('review'));
  assert.equal(result.status, 0);
  const context = claudeContext(result);
  assert.match(context, new RegExp(`skill: review, task: ${id}`));
  assert.match(context, /Demo fix/);
  assert.match(context, /The demo no longer breaks/);
  assert.match(context, /## checks — echo CHECKS-GREEN \(exit 0, tree [0-9a-f]+\+dirty\)/);
  assert.match(context, /CHECKS-GREEN/);
  assert.match(context, new RegExp(`## diff since ${since.slice(0, 7)}|## diff since ${since}`));
  assert.match(context, /\+two/);
});

test('architecture-critique gets the plan it critiques, from the state', () => {
  const { root } = fixture();
  assert.match(claudeContext(run(root, 'claude', skillPayload('architecture-critique'))), /PLAN-MARKER/);
});

test('build skills are told their checks predate the session edits', () => {
  const { root } = fixture();
  const context = claudeContext(run(root, 'claude', skillPayload('write-code')));
  assert.match(context, /baseline, ran before this session's edits/);
  assert.doesNotMatch(context, /## diff/);
});

test('checks.preSpawn overrides verify and keeps a quoted #', () => {
  const { root } = fixture({
    config: 'verify: "echo FULL-GATE"\nchecks:\n  preSpawn: "echo FAST#TAG"\n',
  });
  const context = claudeContext(run(root, 'claude', skillPayload('review')));
  assert.match(context, /## checks — echo FAST#TAG/);
  assert.match(context, /FAST#TAG/);
  assert.doesNotMatch(context, /FULL-GATE/);
});

test('a flag-shaped since is never handed to git', () => {
  const { root } = fixture({ since: '--stat' });
  const context = claudeContext(run(root, 'claude', skillPayload('review')));
  assert.doesNotMatch(context, /## diff/);
});

test('the most recently touched root wins', () => {
  const { root, id } = fixture();
  const newer = idle(root, 'task', '--title', 'Created later, then left alone');
  idle(root, 'task', '--id', id, '--feedback', 'still being worked');
  const context = claudeContext(run(root, 'claude', skillPayload('review')));
  assert.match(context, new RegExp(`task: ${id}`));
  assert.doesNotMatch(context, new RegExp(`task: ${newer.id}`));
});

test('non-pipeline skills get no injection', () => {
  const { root } = fixture();
  assert.equal(run(root, 'claude', skillPayload('some-other-skill')).stdout, '');
});

test('no task in the record means silence', () => {
  assert.equal(run(emptyRepo(), 'claude', skillPayload('review')).stdout, '');
});

test('finished roots are not injected', () => {
  const { root } = fixture({ archived: true });
  assert.equal(run(root, 'claude', skillPayload('review')).stdout, '');
});

test('check results are cached, and slow checks fall back to the stale cache', () => {
  const { root } = fixture({ verify: 'echo EARLIER-GREEN' });
  run(root, 'claude', skillPayload('review'));
  writeFileSync(join(root, 'pipeline.config.yml'), 'verify: "sleep 2"\n');
  const context = claudeContext(run(root, 'claude', skillPayload('review'), { PIPELINE_CHECK_TIMEOUT_MS: '300' }));
  assert.match(context, /STALE/);
  assert.match(context, /EARLIER-GREEN/);
});

test('opencode format prints plain text', () => {
  const { root } = fixture();
  const result = run(root, 'opencode', 'review');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /skill: review, task: T-/);
  assert.match(result.stdout, /CHECKS-GREEN/);
  assert.doesNotMatch(result.stdout, /hookSpecificOutput/);
});

test('codex gets plain text, never JSON-leading, within a tighter budget, and always exits 0', () => {
  const { root } = fixture({ verify: 'seq 1 400' });
  const result = run(root, 'codex', spawnPayload('pipeline-reviewer'));
  assert.equal(result.status, 0);
  // Codex discards stdout that looks like JSON but does not match its schema,
  // and discards everything on a non-zero exit.
  assert.ok(!result.stdout.trimStart().startsWith('{'));
  assert.ok(!result.stdout.trimStart().startsWith('['));
  assert.match(result.stdout, /agent: pipeline-reviewer, task: T-/);
  const claude = claudeContext(run(root, 'claude', spawnPayload('pipeline-reviewer')));
  assert.ok(result.stdout.split('\n').length < claude.split('\n').length);
});

test('kill switch disables injection', () => {
  const { root } = fixture();
  assert.equal(run(root, 'claude', skillPayload('review'), { PIPELINE_SKILL_INJECT: 'off' }).stdout, '');
});

test('malformed payload never breaks the load', () => {
  const { root } = fixture();
  const result = spawnSync(process.execPath, [hook, 'claude'], {
    cwd: root, input: 'not json', encoding: 'utf8', env: { ...process.env, IDLE_BIN: idleBin, ...homes.get(root) },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('SubagentStart injects into a spawned reviewer, with checks and the diff, and names its event', () => {
  const { root, since } = fixture();
  const result = run(root, 'claude', spawnPayload('pipeline-reviewer'));
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.hookEventName, 'SubagentStart');
  const context = claudeContext(result);
  assert.match(context, /agent: pipeline-reviewer, task: T-/);
  assert.match(context, /CHECKS-GREEN/);
  assert.match(context, new RegExp(`## diff since ${since.slice(0, 7)}|## diff since ${since}`));
});

test('a builder gets checks but not the diff it is about to change', () => {
  const { root } = fixture();
  const context = claudeContext(run(root, 'claude', spawnPayload('pipeline-builder')));
  assert.match(context, /predate|baseline/i);
  assert.doesNotMatch(context, /## diff since/);
});

test('an unknown agent type injects nothing', () => {
  const { root } = fixture();
  const result = run(root, 'claude', spawnPayload('some-other-agent'));
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '');
});
