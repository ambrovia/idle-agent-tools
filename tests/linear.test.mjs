// The Linear backend over a fake Linear workspace (a JSON file): what is particular to Linear —
// how tasks look as issues, and that what a human changes in Linear is what idle reads.
// The whole operations journey runs against it too: IDLE_TEST_BACKEND=linear node --test tests/tasks.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const bin = resolve(new URL('..', import.meta.url).pathname, 'idle-tasks/bin/idle.mjs');
const homes = [];
process.on('exit', () => homes.forEach((home) => rmSync(home, { recursive: true, force: true })));

function sandbox({ home: homeConfig = { backend: 'linear', linear: { team: 'ENG' } }, repo } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'idle-linear-'));
  homes.push(home);
  const fake = join(home, 'linear.json');
  writeFileSync(join(home, 'config.json'), JSON.stringify(homeConfig));
  // A repository of its own, when the test gives it an .idle.json.
  const cwd = repo ? join(home, 'repo') : undefined;
  if (repo) {
    spawnSync('git', ['init', '-q', cwd]);
    writeFileSync(join(cwd, '.idle.json'), JSON.stringify(repo));
  }
  const env = { ...process.env, IDLE_HOME: home, IDLE_PROJECT: 'shop', IDLE_LINEAR_FAKE: fake };
  delete env.IDLE_DATABASE_URL;
  delete env.IDLE_PROJECT_DIR; delete env.CLAUDE_PROJECT_DIR;
  const run = (...args) => {
    const r = spawnSync(process.execPath, [bin, ...args], { env, cwd, encoding: 'utf8' });
    let json; try { json = JSON.parse(r.stdout); } catch { /* text */ }
    return { code: r.status, out: r.stdout, err: r.stderr, json };
  };
  const workspace = () => JSON.parse(readFileSync(fake, 'utf8'));
  // What a human does in Linear's app: change an issue directly.
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
    // An issue dropped straight into Linear, never seen by idle.
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

test('blocked is a label, decisions are labelled issues in Done, superseded ones Canceled', () => {
  const { run, workspace, issue, state } = sandbox();
  const root = run('task', '--title', 'Search').json.id;
  const child = run('task', '--title', 'Index products', '--parent', root).json.id;
  run('task', '--id', child, '--status', 'blocked', '--feedback', 'no product feed yet');
  const d1 = run('decision', '--task', root, '--statement', 'Use Postgres full-text search').json.id;
  const d2 = run('decision', '--task', root, '--statement', 'Use a hosted search service instead', '--confirm').json.id;
  run('decision', '--id', d1, '--superseded-by', d2);

  const ws = workspace();
  const label = (name) => ws.labels.find((l) => l.name === name).id;
  assert.ok(issue(ws, child).labelIds.includes(label('blocked')));
  assert.equal(issue(ws, child).stateId, state(ws, 'Todo').id);
  assert.ok(issue(ws, d1).labelIds.includes(label('decision')));
  assert.equal(issue(ws, d1).stateId, state(ws, 'Canceled').id);
  assert.equal(issue(ws, d2).stateId, state(ws, 'Done').id);
  assert.deepEqual(run('list').json.map((t) => t.id), [root], 'decisions are not tasks');

  run('task', '--id', child, '--status', 'open');
  assert.ok(!issue(workspace(), child).labelIds.includes(label('blocked')));
});

test('a refused operation writes nothing to Linear', () => {
  const { run, workspace } = sandbox();
  const root = run('task', '--title', 'Root').json.id;
  const before = JSON.stringify(workspace().issues);
  const refused = run('task', '--id', root, '--title', 'Renamed', '--status', 'submitted');
  assert.equal(refused.code, 1);
  assert.equal(JSON.stringify(workspace().issues), before);
});

test('the repository says where its tasks live; the machine only holds the key', () => {
  const { run, workspace } = sandbox({ home: { linear: { apiKey: 'unused-by-the-fake' } }, repo: { backend: 'linear', linear: { team: 'Shop', project: 'Storefront' } } });
  assert.equal(run('doctor').json.mode, 'linear');
  const id = run('task', '--title', 'Wishlist').json.id;
  const ws = workspace();
  const issue = ws.issues.find((i) => i.attachments[0].metadata.id === id);
  assert.equal(ws.teams.find((t) => t.id === issue.teamId).key, 'Shop');
  assert.equal(ws.projects.find((p) => p.id === issue.projectId).name, 'Storefront');
  assert.deepEqual(run('list').json.map((t) => t.id), [id]);
});

test('without a team for the repository, Linear is refused with what to add', () => {
  const { run } = sandbox({ home: { backend: 'linear', linear: { apiKey: 'k' } } });
  const r = run('list');
  assert.equal(r.code, 2);
  assert.match(r.err, /\.idle\.json/);
});
