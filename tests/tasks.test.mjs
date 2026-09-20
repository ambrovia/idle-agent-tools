// The happy journey and the basic refusals, through the CLI, against local PGlite.
// Set IDLE_TEST_DATABASE_URL to run the same journey against a Postgres.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const bin = resolve(new URL('..', import.meta.url).pathname, 'tasks/bin/idle.mjs');

function sandbox() {
  const env = { ...process.env, IDLE_HOME: mkdtempSync(join(tmpdir(), 'idle-')), IDLE_PROJECT: `test-${Date.now()}` };
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

test('a stream travels from open to done', () => {
  const { run, task, create } = sandbox();
  const root = create('Task backend for agentic work', '--goal', 'Agents coordinate through one record of work');
  const store = create('Storage adapter', '--parent', root, '--scope', 'tasks/src', '--check', 'npm test');
  const cli = create('Command line', '--parent', root, '--needs', store);

  assert.deepEqual(run('list', '--ready').json.map((t) => t.id), [store], 'only the task with nothing pending is ready');

  assert.equal(task('--id', store, '--status', 'claimed', '--by', 'alice').json.status, 'claimed');
  assert.equal(task('--id', store, '--status', 'submitted', '--by', 'alice').json.status, 'submitted', 'a task with checks waits for them');
  assert.equal(task('--id', store, '--status', 'open', '--verdict', 'npm test: 2 failing').json.status, 'open');
  assert.match(run('show', store).json.task.verdict, /2 failing/, 'the next worker sees why it came back');

  task('--id', store, '--status', 'claimed', '--by', 'bob');
  task('--id', store, '--status', 'submitted', '--by', 'bob');
  assert.equal(task('--id', store, '--status', 'verified').json.status, 'done', 'review is off: verified is done');

  assert.deepEqual(run('list', '--ready').json.map((t) => t.id), [cli], 'finishing a task readies what needed it');
  task('--id', cli, '--status', 'claimed', '--by', 'alice');
  assert.equal(task('--id', cli, '--status', 'submitted', '--by', 'alice').json.status, 'done', 'no checks, nothing to wait for');

  assert.equal(task('--id', root, '--status', 'done').json.status, 'done');
  assert.equal(task('--id', cli, '--status', 'open', '--verdict', 'help text is missing', '--by', 'human').json.status, 'open');
  assert.match(run('list', '--root', root).out, new RegExp(`${cli}\\s+\\[open\\]`));
});

test('refusals', () => {
  const { task, create } = sandbox();
  const root = create('Refusal stream');
  const a = create('Rework the login form', '--parent', root, '--scope', 'src/auth');
  const b = create('Session expiry', '--parent', root, '--scope', 'src/auth/session.ts');

  const similar = task('--title', 'Rework login form', '--parent', root);
  assert.equal(similar.json.created, false, 'search before create');
  assert.equal(similar.json.similar[0].id, a);

  assert.equal(task('--id', root, '--status', 'claimed', '--by', 'alice').code, 1, 'a parent is not claimable');
  task('--id', a, '--status', 'claimed', '--by', 'alice');
  assert.match(task('--id', a, '--status', 'claimed', '--by', 'bob').err, /not ready/, 'held');
  assert.match(task('--id', b, '--status', 'claimed', '--by', 'bob').err, /overlaps/, 'scope overlap');
  assert.match(task('--id', a, '--status', 'submitted', '--by', 'bob').err, /not claimed by bob/);
  assert.match(task('--id', a, '--status', 'done').err, /cannot move/, 'a worker cannot skip to done');
  assert.match(task('--id', a, '--feedback', 'x'.repeat(1500)).err, /too long/);
  assert.match(task('--id', a, '--status', 'blocked').err, /needs --feedback/);
  assert.equal(task('--id', root, '--status', 'done').code, 1, 'children unfinished');

  assert.equal(task('--id', a, '--status', 'blocked', '--feedback', 'the form library cannot do this', '--by', 'alice').json.status, 'blocked');
  assert.equal(task('--id', b, '--status', 'claimed', '--by', 'bob').json.status, 'claimed', 'a blocked task no longer holds its scope');
});

test('decisions are searched before they are recorded, and can be superseded', () => {
  const { run, create } = sandbox();
  const root = create('Decision stream');
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
  const root = create('Race stream');
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
  const { env, task, create } = sandbox();
  writeFileSync(join(env.IDLE_HOME, 'config.json'), JSON.stringify({ review: true }));
  const root = create('Reviewed stream');
  const work = create('Reviewed work', '--parent', root);
  task('--id', work, '--status', 'claimed', '--by', 'alice');
  assert.equal(task('--id', work, '--status', 'submitted', '--by', 'alice').json.status, 'verified', 'no checks, so it waits for review');
  assert.match(task('--id', work, '--status', 'done', '--by', 'alice').err, /cannot pass its review/);
  assert.equal(task('--id', work, '--status', 'done', '--by', 'bob').json.status, 'done');
});

test('the same operations over MCP', async () => {
  const { env } = sandbox();
  const server = spawn(process.execPath, [bin, 'mcp'], { env, stdio: ['pipe', 'pipe', 'inherit'] });
  const replies = new Map();
  let buffer = '';
  server.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let at; (at = buffer.indexOf('\n')) >= 0; buffer = buffer.slice(at + 1)) {
      const message = JSON.parse(buffer.slice(0, at));
      replies.get(message.id)?.(message);
    }
  });
  let next = 0;
  const ask = (method, params) => new Promise((done) => {
    const id = ++next;
    replies.set(id, done);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

  const hello = await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test-harness', version: '0' } });
  assert.equal(hello.result.serverInfo.name, 'idle');
  const { tools } = (await ask('tools/list')).result;
  assert.deepEqual(tools.map((t) => t.name), ['task', 'decision', 'show', 'list']);

  const made = await ask('tools/call', { name: 'task', arguments: { title: 'A stream opened over MCP' } });
  const id = JSON.parse(made.result.content[0].text).id;
  const refused = await ask('tools/call', { name: 'task', arguments: { id, status: 'done' } });
  assert.equal(refused.result.isError, true);
  assert.match(refused.result.content[0].text, /refused/);

  server.stdin.end();
  assert.equal(await new Promise((done) => server.on('exit', done)), 0);
});
