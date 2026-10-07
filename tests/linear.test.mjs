import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const bin = resolve(new URL('..', import.meta.url).pathname, 'idle-tasks/bin/idle.mjs');
const homes = [];
process.on('exit', () => homes.forEach((home) => rmSync(home, { recursive: true, force: true })));

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'idle-linear-'));
  homes.push(home);
  const fake = join(home, 'linear.json');
  writeFileSync(join(home, 'config.json'), JSON.stringify({ backend: 'linear', linear: { team: 'ENG' } }));
  const env = { ...process.env, IDLE_HOME: home, IDLE_PROJECT: 'shop', IDLE_LINEAR_FAKE: fake };
  delete env.IDLE_DATABASE_URL;
  const run = (...args) => {
    const r = spawnSync(process.execPath, [bin, ...args], { env, encoding: 'utf8' });
    return { code: r.status, json: r.stdout.startsWith('{') || r.stdout.startsWith('[') ? JSON.parse(r.stdout) : null };
  };
  const workspace = () => JSON.parse(readFileSync(fake, 'utf8'));
  const edit = (fn) => { const ws = workspace(); fn(ws); writeFileSync(fake, JSON.stringify(ws)); };
  const issue = (ws, id) => ws.issues.find((i) => i.attachments.some((a) => a.metadata.id === id) || i.identifier === id);
  const state = (ws, name) => ws.teams[0].states.find((s) => s.name === name);
  return { run, workspace, edit, issue, state };
}

test('a task is an issue: description sections, sub-issues, workflow states, idle fields in its attachment', () => {
  const { run, workspace, issue, state } = sandbox();
  const root = run('task', '--title', 'Checkout survives an outage', '--goal', 'Orders still go through', '--ac', 'an order is placed', '--plan', 'Queue the charge').json.id;
  const child = run('task', '--title', 'Queue the charge', '--parent', root, '--scope', 'src/pay').json.id;
  assert.equal(run('task', '--id', child, '--status', 'claimed', '--by', 'w1').code, 0);

  const ws = workspace();
  const r = issue(ws, root); const c = issue(ws, child);
  assert.equal(ws.projects.find((p) => p.id === r.projectId).name, 'shop');
  assert.equal(r.description, 'Orders still go through\n\n## Signs the goal is reached\n\nan order is placed\n\n## Plan\n\nQueue the charge');
  assert.equal(c.parentId, r.id);
  assert.equal(c.stateId, state(ws, 'In Progress').id);
  const meta = c.attachments[0].metadata;
  assert.deepEqual([meta.id, meta.claimed_by, meta.scope], [child, 'w1', ['src/pay']]);
});

test('what a human changes in Linear is what idle reads', () => {
  const { run, edit, issue, state } = sandbox();
  const root = run('task', '--title', 'Newsletter signup').json.id;
  const child = run('task', '--title', 'Signup form', '--parent', root).json.id;

  edit((ws) => {
    issue(ws, root).description = 'People can subscribe from the landing page\n\n## Plan\n\nOne form, one endpoint';
    issue(ws, child).title = 'Signup form on the landing page';
    issue(ws, child).stateId = state(ws, 'Done').id;
    const r = issue(ws, root);
    ws.issues.push({ ...r, id: 'human-1', identifier: 'ENG-99', title: 'Confirmation email', description: 'Send one', parentId: r.id,
      stateId: state(ws, 'Todo').id, labelIds: [], attachments: [], createdAt: new Date(Date.now() + 1000).toISOString() });
  });

  const shown = run('show', root).json;
  assert.equal(shown.task.goal, 'People can subscribe from the landing page');
  assert.equal(shown.task.plan, 'One form, one endpoint');
  assert.deepEqual(shown.children.map((c) => [c.id, c.status]), [[child, 'done'], ['ENG-99', 'open']]);
  assert.equal(run('show', child).json.task.title, 'Signup form on the landing page');
  assert.deepEqual(run('list', '--ready').json.map((t) => t.id), ['ENG-99']);
  assert.equal(run('task', '--id', 'ENG-99', '--status', 'claimed', '--by', 'w1').json.status, 'claimed');
});
