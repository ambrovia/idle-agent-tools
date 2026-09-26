// The happy journey and the basic refusals, through the CLI, against local PGlite.
// Set IDLE_TEST_DATABASE_URL to run the same journey against a Postgres.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const bin = resolve(new URL('..', import.meta.url).pathname, 'idle-tasks/bin/idle.mjs');

// Every sandbox is a whole PGlite database; leave none behind.
const homes = [];
process.on('exit', () => homes.forEach((home) => rmSync(home, { recursive: true, force: true })));

function sandbox(config) {
  const env = { ...process.env, IDLE_HOME: mkdtempSync(join(tmpdir(), 'idle-')), IDLE_PROJECT: `test-${Date.now()}` };
  homes.push(env.IDLE_HOME);
  if (config) writeFileSync(join(env.IDLE_HOME, 'config.json'), JSON.stringify(config(env.IDLE_PROJECT)));
  delete env.IDLE_DATABASE_URL;
  if (process.env.IDLE_TEST_DATABASE_URL) env.IDLE_DATABASE_URL = process.env.IDLE_TEST_DATABASE_URL;
  const run = (...args) => {
    const r = spawnSync(process.execPath, [bin, ...args], { env, encoding: 'utf8' });
    let json; try { json = JSON.parse(r.stdout); } catch { /* text output */ }
    return { code: r.status, out: r.stdout, err: r.stderr, json };
  };
  const task = (...args) => run('task', ...args);
  return { env, run, task, create: (title, ...args) => task('--title', title, ...args).json.id };
}

test('a dropped task grows into a tree and travels to done', () => {
  // The project's checks are configured on the machine; the system runs them at submit.
  const { env, run, task, create } = sandbox((project) => ({ checks: { [project]: ['test -f checks-pass'] } }));
  const root = create('Task backend for agentic work'); // a title is enough
  assert.equal(run('show', root).json.task.goal, '');
  task('--id', root, '--goal', 'Agents coordinate through one record of work', '--meta', JSON.stringify({ worktree: env.IDLE_HOME }));
  const store = create('Storage adapter', '--parent', root, '--scope', 'idle-tasks/src'); // inherits the root's worktree
  const cli = create('Command line', '--parent', root, '--needs', store);

  assert.deepEqual(run('list', '--ready').json.map((t) => t.id), [store], 'only the task with nothing pending is ready');

  assert.equal(task('--id', store, '--status', 'claimed', '--by', 'alice').json.status, 'claimed');
  const failed = task('--id', store, '--status', 'submitted', '--by', 'alice').json;
  assert.equal(failed.status, 'open', 'the system ran the checks and sent it back itself');
  assert.match(failed.verdict, /checks failed — `test -f checks-pass` exited 1/, 'the next worker sees why');

  writeFileSync(join(env.IDLE_HOME, 'checks-pass'), '');
  task('--id', store, '--status', 'claimed', '--by', 'bob');
  assert.equal(task('--id', store, '--status', 'submitted', '--by', 'bob').json.status, 'done', 'green, and review is off');

  assert.deepEqual(run('list', '--ready').json.map((t) => t.id), [cli], 'finishing a task readies what needed it');
  task('--id', cli, '--status', 'claimed', '--by', 'alice');
  assert.equal(task('--id', cli, '--status', 'submitted', '--by', 'alice').json.status, 'done');

  assert.equal(task('--id', root, '--status', 'done').json.status, 'done');
  assert.equal(task('--id', cli, '--status', 'open', '--verdict', 'help text is missing', '--by', 'human').json.status, 'open');
  assert.match(run('list', '--root', root).out, new RegExp(`${cli}\\s+\\[open\\]`));
});

test('refusals', () => {
  const { task, create } = sandbox();
  const root = create('Refusals');
  const a = create('Rework the login form', '--parent', root, '--scope', 'src/auth');
  const b = create('Session expiry', '--parent', root, '--scope', 'src/auth/session.ts');

  const similar = task('--title', 'Rework login form', '--parent', root);
  assert.equal(similar.json.created, false, 'search before create');
  assert.equal(similar.json.similar[0].id, a);

  assert.equal(task('--id', root, '--status', 'claimed', '--by', 'alice').code, 1, 'a parent is not claimable');
  task('--id', a, '--status', 'claimed', '--by', 'alice');
  assert.match(task('--id', a, '--status', 'claimed', '--by', 'bob').err, /claimed by alice/, 'held');
  assert.equal(task('--title', 'Rework the signup form', '--parent', root).json.status, 'open', 'a sibling with a similar name is not a duplicate');
  assert.match(task('--id', b, '--status', 'claimed', '--by', 'bob').err, /overlaps/, 'scope overlap');
  assert.match(task('--id', a, '--status', 'submitted', '--by', 'bob').err, /not claimed by bob/);
  assert.match(task('--id', a, '--status', 'done').err, /cannot move/, 'a worker cannot skip to done');
  assert.match(task('--id', a, '--status', 'verified').err, /cannot move/, 'nobody verifies by hand');
  assert.match(task('--id', a, '--feedback', 'x'.repeat(1500)).err, /too long/);
  assert.match(task('--id', a, '--status', 'blocked', '--by', 'alice').err, /needs --feedback/);
  assert.equal(task('--id', root, '--status', 'done').code, 1, 'children unfinished');

  assert.equal(task('--id', a, '--status', 'blocked', '--feedback', 'the form library cannot do this', '--by', 'alice').json.status, 'blocked');
  assert.equal(task('--id', b, '--status', 'claimed', '--by', 'bob').json.status, 'claimed', 'a blocked task no longer holds its scope');
  assert.match(task('--id', b, '--status', 'blocked', '--feedback', 'not yours', '--by', 'alice').err, /claimed by bob/, 'only the holder blocks a live claim');
  assert.match(task('--id', b, '--status', 'claimed', '--ttl', 'soon', '--by', 'bob').err, /--ttl must be a number/);
});

test('an expired lease is nobody\'s: renewing it is a new claim, scope check and all', async () => {
  const { task, create } = sandbox();
  const root = create('Leases');
  const wide = create('Whole auth module', '--parent', root, '--scope', 'src/auth');
  const narrow = create('Session file only', '--parent', root, '--scope', 'src/auth/session.ts');
  assert.equal(task('--id', wide, '--status', 'claimed', '--ttl', '0.01', '--by', 'alice').json.status, 'claimed', 'a lease may be a fraction of a minute');
  await new Promise((done) => setTimeout(done, 1200));
  assert.equal(task('--id', narrow, '--status', 'claimed', '--by', 'bob').json.status, 'claimed', 'the expired lease no longer holds its scope');
  assert.match(task('--id', wide, '--status', 'claimed', '--by', 'alice').err, /overlaps/, 'alice cannot quietly renew over bob');
});

test('while the system is verifying a task, nothing else moves it or runs its checks again', async () => {
  const { env, run, task, create } = sandbox((project) => ({ checks: { [project]: ['sleep 3 && echo ran >> check-runs'] } }));
  const root = create('Verification in flight');
  task('--id', root, '--meta', JSON.stringify({ worktree: env.IDLE_HOME }));
  const work = create('Slow to verify', '--parent', root);
  task('--id', work, '--status', 'claimed', '--by', 'alice');

  const submitting = new Promise((done) => {
    spawn(process.execPath, [bin, 'task', '--id', work, '--status', 'submitted', '--by', 'alice'], { env, stdio: 'ignore' }).on('exit', done);
  });
  await new Promise((done) => setTimeout(done, 1200)); // the checks are now running
  assert.equal(task('--id', work, '--feedback', 'just a note', '--by', 'carol').json.status, 'submitted', 'an unrelated edit leaves it alone');
  assert.match(task('--id', root, '--status', 'archived').err, /being verified/, 'nor can its tree be archived under it');

  assert.equal(await submitting, 0);
  assert.equal(run('show', work).json.task.status, 'done');
  assert.equal(readFileSync(join(env.IDLE_HOME, 'check-runs'), 'utf8').trim().split('\n').length, 1, 'the checks ran exactly once');
});

test('decisions are searched before they are recorded, and can be superseded', () => {
  const { run, create } = sandbox();
  const root = create('Decisions');
  const first = run('decision', '--task', root, '--statement', 'PGlite locally, any Postgres when shared', '--rationale', 'one dialect').json;
  assert.equal(first.status, 'active');
  assert.equal(run('decision', '--task', root, '--statement', 'PGlite locally and any Postgres when shared').json.created, false);
  const second = run('decision', '--task', root, '--statement', 'Postgres everywhere, no embedded database', '--confirm').json;
  assert.equal(run('decision', '--id', first.id, '--superseded-by', second.id).json.status, 'superseded');
  assert.equal(run('list', '--root', root, '--decisions').json.length, 2);
  assert.deepEqual(run('show', root).json.decisions.map((d) => d.id).sort(), [first.id, second.id].sort());
});

test('many processes race for one claim: one winner, no hang', async () => {
  const { env, run, create } = sandbox();
  const root = create('Race');
  const contested = create('The contested task', '--parent', root);
  const codes = await Promise.all(['w1', 'w2', 'w3', 'w4', 'w5'].map((by) => new Promise((done) => {
    spawn(process.execPath, [bin, 'task', '--id', contested, '--status', 'claimed', '--by', by], { env, stdio: 'ignore' }).on('exit', done);
  })));
  assert.equal(codes.filter((c) => c === 0).length, 1);
  assert.equal(codes.filter((c) => c === 1).length, 4);
  assert.equal(run('show', contested).json.task.status, 'claimed');
});

test('the brief carries what the task is for; the state shows what needs attention', () => {
  const { run, task, create } = sandbox();
  const root = create('Checkout survives a payment outage', '--goal', 'A customer can still place an order when the payment provider is down',
    '--plan', 'Queue the charge, confirm the order, settle later.');
  const queue = create('Charge queue', '--parent', root, '--goal', 'Charges wait safely until the provider is back', '--ac', 'a queued charge survives a restart');
  run('decision', '--task', root, '--statement', 'Orders are confirmed before the charge settles');

  const brief = run('show', queue, '--brief').out;
  for (const expected of ['Charges wait safely', 'A customer can still place an order', 'Queue the charge', 'Orders are confirmed before', 'survives a restart']) {
    assert.match(brief, new RegExp(expected));
  }

  task('--id', queue, '--status', 'blocked', '--feedback', 'the provider has no idempotency keys');
  const state = run('show', queue, '--state').out;
  assert.match(state, new RegExp(`${queue} blocked`));
  assert.match(state, /no idempotency keys/);
});

test('with review on, whoever did the work cannot pass it', () => {
  const { task, create } = sandbox(() => ({ review: true }));
  const root = create('Review policy');
  const work = create('Reviewed work', '--parent', root);
  task('--id', work, '--status', 'claimed', '--by', 'alice');
  assert.equal(task('--id', work, '--status', 'submitted', '--by', 'alice').json.status, 'verified', 'no checks configured, so it waits for review');
  assert.match(task('--id', work, '--status', 'done', '--by', 'alice').err, /cannot pass its review/);
  assert.equal(task('--id', work, '--status', 'done', '--by', 'bob').json.status, 'done');
});

// A harness talking to the MCP server over stdio. Notifications the server sends land in `notices`.
function mcp(env, cwd) {
  const server = spawn(process.execPath, [bin, 'mcp'], { env, cwd, stdio: ['pipe', 'pipe', 'inherit'] });
  const replies = new Map();
  const notices = [];
  let buffer = '';
  server.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let at; (at = buffer.indexOf('\n')) >= 0; buffer = buffer.slice(at + 1)) {
      const message = JSON.parse(buffer.slice(0, at));
      if (message.id === undefined || !replies.has(message.id)) notices.push(message);
      replies.get(message.id)?.(message);
    }
  });
  let next = 0;
  const write = (message) => server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  const ask = (method, params) => new Promise((done) => {
    const id = ++next;
    replies.set(id, done);
    write({ id, method, params });
  });
  const close = () => { server.stdin.end(); return new Promise((done) => server.on('exit', done)); };
  return { ask, write, notices, close };
}

test('the same operations over MCP', async () => {
  const { env } = sandbox();
  const { ask, close } = mcp(env);

  const hello = await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test-harness', version: '0' } });
  assert.equal(hello.result.serverInfo.name, 'idle');
  const { tools } = (await ask('tools/list')).result;
  assert.deepEqual(tools.map((t) => t.name), ['task', 'decision', 'show', 'list']);

  const made = await ask('tools/call', { name: 'task', arguments: { title: 'A task dropped over MCP' } });
  const id = JSON.parse(made.result.content[0].text).id;
  const refused = await ask('tools/call', { name: 'task', arguments: { id, status: 'done' } });
  assert.equal(refused.result.isError, true);
  assert.match(refused.result.content[0].text, /refused/);

  assert.equal(await close(), 0);
});

test('outside a repository the MCP server offers nothing, until the harness names one', async () => {
  const { env } = sandbox();
  for (const name of ['IDLE_PROJECT', 'IDLE_PROJECT_DIR', 'CLAUDE_PROJECT_DIR']) delete env[name];
  const scratch = mkdtempSync(join(tmpdir(), 'idle-scratch-'));
  const repo = mkdtempSync(join(tmpdir(), 'idle-repo-'));
  spawnSync('git', ['init', '-q', repo]);
  const { ask, write, notices, close } = mcp(env, scratch);

  await ask('initialize', { protocolVersion: '2025-06-18', capabilities: { roots: {} }, clientInfo: { name: 'test-harness', version: '0' } });
  assert.deepEqual((await ask('tools/list')).result.tools, [], 'a scratch folder sees no tools');
  const refused = await ask('tools/call', { name: 'list', arguments: { all: true, project: 'someone-else' } });
  assert.equal(refused.result.isError, true);
  assert.match(refused.result.content[0].text, /not inside a repository/, 'naming a project does not get around it');

  write({ method: 'notifications/initialized' });
  write({ id: 'roots', result: { roots: [{ uri: `file://${repo}` }] } });
  await ask('ping');
  assert.ok(notices.some((n) => n.method === 'notifications/tools/list_changed'), 'the harness is told the tools changed');
  assert.equal((await ask('tools/list')).result.tools.length, 4);
  assert.equal((await ask('tools/call', { name: 'list', arguments: {} })).result.isError, false);

  assert.equal(await close(), 0);
  rmSync(scratch, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

test('every place that starts the published server names exactly the version in idle-tasks/package.json', () => {
  // npx keeps serving a cached install for a version range, so a range never picks up a fix.
  const repo = resolve(new URL('..', import.meta.url).pathname);
  const { version } = JSON.parse(readFileSync(join(repo, 'idle-tasks/package.json'), 'utf8'));
  for (const file of ['idle-tasks/.codex-plugin/plugin.json', 'idle-tasks/.cursor-plugin/plugin.json', 'scripts/install-opencode.sh', 'scripts/install-cursor.sh', 'idle-skills/hooks/inject.mjs', 'idle-tasks/mcp_config.json']) {
    const pins = readFileSync(join(repo, file), 'utf8').match(/idle-agent-tasks@[0-9][0-9.]*/g) ?? [];
    assert.ok(pins.length > 0, `${file} starts the server`);
    for (const pin of pins) assert.equal(pin, `idle-agent-tasks@${version}`, file);
  }
  for (const file of ['idle-tasks/.claude-plugin/plugin.json', 'idle-tasks/.codex-plugin/plugin.json', 'idle-tasks/.cursor-plugin/plugin.json', 'idle-tasks/plugin.json']) {
    assert.equal(JSON.parse(readFileSync(join(repo, file), 'utf8')).version, version, file);
  }
});
