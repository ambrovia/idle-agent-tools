// The base of idle-harness — the loop, the plain turn, tools, versions, the record — against a scripted model
// and a stand-in for OpenRouter. No network.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(new URL('..', import.meta.url).pathname, 'idle-harness');
const { run } = await import(`${root}/src/loop.ts`);
const { model } = await import(`${root}/src/model.ts`);
const { claim, follower, holder, read, send, take } = await import(`${root}/src/record.ts`);
const { sessionDir } = await import(`${root}/src/home.ts`);
const { BARE } = await import(`${root}/src/tools.ts`);
const versions = await import(`${root}/src/versions.ts`);
const analytics = await import(`${root}/src/analytics.ts`);
const compaction = await import(`${root}/src/compact.ts`);

const homes = [];
process.on('exit', () => homes.forEach((home) => rmSync(home, { recursive: true, force: true })));

// A user space of its own, a place to work in, and one harness named h.
function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'idle-harness-'));
  homes.push(home);
  process.env.IDLE_HOME = home;
  mkdirSync(join(home, 'work'));
  return { home, cwd: join(home, 'work'), harness: join(home, 'harness', 'h') };
}

// A model that answers from a script — text, a list of tool calls, or an error to throw — and remembers what it was shown.
function scripted(...answers) {
  const shown = [];
  const model = async (context, prompt) => {
    shown.push({ ...context, messages: [...context.messages, ...prompt] });
    const next = answers.shift() ?? 'done';
    if (next instanceof Error) throw next;
    const calls = Array.isArray(next) && next.map(([name, args], i) => ({ id: `call-${shown.length}-${i}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }));
    return { message: calls ? { role: 'assistant', content: null, tool_calls: calls } : { role: 'assistant', content: next }, usage: {}, cost: 0.01 };
  };
  return { model, shown };
}

const say = (session, text) => send(sessionDir('h', session), 'user', text);
const said = (context) => context.messages.map((message) => message.content).join('\n');
const names = (context) => context.tools.map((tool) => tool.function.name);
const bare = (name) => BARE.find((tool) => tool.spec.function.name === name);
const blocks = (cwd) => ({ cwd, name: 'h', version: 'v', harness: cwd });
const harnessFile = (harness, file, text) => { mkdirSync(join(harness, file, '..'), { recursive: true }); writeFileSync(join(harness, file), text); };

test('the modules import each other without a cycle, type imports included', () => {
  const files = readdirSync(root, { recursive: true }).filter((file) => file.endsWith('.ts') && !file.includes('node_modules')).map((file) => join(root, file));
  const imports = Object.fromEntries(files.map((file) => [file, [...readFileSync(file, 'utf8').matchAll(/(?:from |import\()'(\.\.?\/[\w./-]+\.ts)'/g)].map((m) => resolve(file, '..', m[1]))]));
  const done = new Set();
  const visit = (file, path) => {
    if (done.has(file)) return;
    assert.ok(!path.includes(file), `import cycle: ${[...path, file].join(' → ')}`);
    for (const next of imports[file] ?? []) visit(next, [...path, file]);
    done.add(file);
  };
  Object.keys(imports).forEach((file) => visit(file, []));
});

test('an empty harness works: the plain turn, the bare tools, a record of every turn', async () => {
  const { cwd, harness } = sandbox();
  const { model, shown } = scripted([['bash', { command: 'echo hello > out.txt && echo $IDLE_BY' }]], 'made it');
  process.env.IDLE_HARNESS_MODEL = 'some/model';
  say('s', 'make a file');
  await run({ harness: 'h', session: 's', cwd, once: true, model });
  delete process.env.IDLE_HARNESS_MODEL;

  assert.equal(readFileSync(join(cwd, 'out.txt'), 'utf8'), 'hello\n');
  const record = read(sessionDir('h', 's'));
  assert.deepEqual(record.map((entry) => entry.n), [0, 1, 2]);
  assert.equal(record[0].arrived[0].text, 'make a file');
  assert.equal(record[0].cost, 0.01);
  assert.equal(shown[0].model, 'some/model', 'an empty model in the context means the default');
  assert.deepEqual(names(shown[0]), ['read', 'write', 'edit', 'bash', 'versions']);
  // A command carries the harness and its version into the record of work.
  assert.equal(record[1].calls[0].result.trim(), `harness/h@${record[1].version}`);
  assert.equal(record[1].response.content, 'made it');
  assert.equal(record[2].response, null, 'with nothing left to do the turn waits, and no model is called');
  // The folder is still empty, and the base's records are not part of it.
  assert.equal(versions.list(harness).split('\n').length, 1);
  // Only the messages after the shared start are written; reading gives the whole context back.
  const raw = readFileSync(join(sessionDir('h', 's'), 'record.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(raw[1].keep > 0 && raw[1].context.messages.length < record[1].context.messages.length);
});

test('a change to the harness is saved as a version and is live one turn later', async () => {
  const { cwd, harness } = sandbox();
  const own = `import { mark } from './mark.ts';
export async function turn(context, response, arrived, base) {
  const step = await base.turn(context, response, arrived);
  return { ...step, context: { ...step.context, system: step.context.system.split('\\n# ')[0] + '\\n# ' + mark } };
}`;
  const { model, shown } = scripted(
    [['write', { path: join(harness, 'turn.ts'), content: own }], ['write', { path: join(harness, 'mark.ts'), content: "export const mark = 'one';" }]],
    [['edit', { path: join(harness, 'mark.ts'), old: 'one', new: 'two' }]],
  );
  say('s', 'specialise');
  await run({ harness: 'h', session: 's', cwd, once: true, model });

  const record = read(sessionDir('h', 's'));
  assert.ok(!shown[1].system.includes('\n# '), 'the turn that wrote the files still ran the old harness');
  assert.ok(shown[2].system.endsWith('\n# one'), 'one turn later the harness runs its own turn');
  assert.ok(record[3].context.system.endsWith('\n# two'), 'a file the turn imports is loaded again with the new version');
  assert.equal(new Set(record.map((entry) => entry.version)).size, 3);
  assert.equal(versions.list(harness).split('\n').length, 3);
});

test("a harness's own tool joins the registry one turn later; a broken one is left out and the agent told", async () => {
  const { cwd, harness } = sandbox();
  const shout = "export const description = 'Says it louder';\nexport const parameters = { type: 'object', properties: { text: { type: 'string' } } };\nexport const run = ({ text }, base) => text.toUpperCase() + ' from ' + base.name;";
  const { model, shown } = scripted(
    [
      ['write', { path: join(harness, 'tools/shout.ts'), content: shout }],
      ['write', { path: join(harness, 'tools/broken.ts'), content: 'export const description = ' }],
      ['write', { path: join(harness, 'tools/versions.ts'), content: shout }],
    ],
    [['shout', { text: 'hi' }]],
  );
  say('s', 'make yourself a tool');
  await run({ harness: 'h', session: 's', cwd, once: true, model });

  const record = read(sessionDir('h', 's'));
  assert.ok(!names(shown[1]).includes('shout'), 'not yet in the turn that wrote it');
  assert.deepEqual(names(shown[2]), ['read', 'write', 'edit', 'bash', 'versions', 'shout']);
  assert.match(shown[2].tools.find((tool) => tool.function.name === 'versions').function.description, /Earlier versions/, 'versions stays the base\'s');
  assert.match(said(shown[2]), /left out: tools\/broken\.ts/);
  assert.match(said(shown[2]), /left out: tools\/versions\.ts: versions is the base's/);
  assert.equal(record[2].calls[0].result, 'HI from h');
});

test('a turn that throws: the plain turn takes over, no tool runs twice, and the agent is told once', async () => {
  const { cwd, harness } = sandbox();
  harnessFile(harness, 'turn.ts', `export async function turn(context, response, arrived, base) {
  for (const call of response?.tool_calls ?? []) await base.tool(call);
  throw new Error('boom');
}`);
  const { model, shown } = scripted([['bash', { command: 'echo x >> count.txt' }]]);
  say('s', 'go');
  await run({ harness: 'h', session: 's', cwd, once: true, model });

  const record = read(sessionDir('h', 's'));
  assert.ok(record.every((entry) => entry.threw.includes('boom')));
  assert.equal(readFileSync(join(cwd, 'count.txt'), 'utf8'), 'x\n');
  assert.equal(said(shown.at(-1)).split('Your turn threw').length - 1, 1);
  assert.equal(record.at(-1).response, null, 'the session still comes to rest');
});

test('a turn cannot hurt the session: it works on copies, and a step that is not whole counts as thrown', async () => {
  const { cwd, harness } = sandbox();
  harnessFile(harness, 'turn.ts', `export async function turn(context, response, arrived, base) {
  context.messages.push({ role: 'user', content: 'junk' });
  arrived.length = 0;
  return { context: { messages: context.messages }, prompt: 'hi' };
}`);
  const { model, shown } = scripted('fine');
  say('s', 'go');
  await run({ harness: 'h', session: 's', cwd, once: true, model });

  assert.ok(!said(shown[0]).includes('junk'));
  assert.match(said(shown[0]), /^go\n\[base\] Your turn threw.*no whole context/s);
  assert.deepEqual(names(shown[0]), ['read', 'write', 'edit', 'bash', 'versions']);
});

test('a request the provider refuses goes to the plain turn, which builds it again from the originals', async () => {
  const { cwd, harness } = sandbox();
  harnessFile(harness, 'turn.ts', `export async function turn(context, response, arrived, base) {
  const step = await base.turn(context, response, arrived);
  return { ...step, context: { ...step.context, model: 'no/such-model' } };
}`);
  const { model, shown } = scripted(Object.assign(new Error('the model call failed (400): no such model'), { status: 400 }), 'fine');
  process.env.IDLE_HARNESS_MODEL = 'good/model';
  say('s', 'go');
  const last = await run({ harness: 'h', session: 's', cwd, once: true, model });
  delete process.env.IDLE_HARNESS_MODEL;

  assert.deepEqual(shown.map((context) => context.model), ['no/such-model', 'good/model']);
  assert.match(said(shown[1]), /refused the request your turn built/);
  assert.equal(read(sessionDir('h', 's'))[0].response.content, 'fine');
  assert.equal(last.failed, undefined);
});

// A model that writes a summary when the base asks for one, and otherwise answers as `model` does.
const SUMMARY = ['Goal', 'Constraints and preferences', 'Done', 'In progress / Blocked', 'Decisions and why', 'Dead ends', 'Unverified', 'Next step', 'Critical data'].map((h) => `## ${h}\n- noted`).join('\n');
const summarising = (model, summary = SUMMARY) => {
  const asked = [];
  const wrapped = async (context, prompt) => {
    if (!String(prompt.at(-1)?.content).startsWith('[base] Compaction.')) return model(context, prompt);
    asked.push({ context, prompt });
    return { message: { role: 'assistant', content: typeof summary === 'function' ? summary() : summary }, usage: {}, cost: 0.005 };
  };
  return Object.assign(wrapped, { asked });
};
const exchange = (id, name, args, answer) => [
  { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
  { role: 'tool', tool_call_id: id, content: answer },
];

test('a long tool answer goes to a file whole; the context gets its two ends and where the rest is', async () => {
  const { cwd } = sandbox();
  const { model, shown } = scripted([['bash', { command: "printf 'x%.0s' $(seq 1 50000); echo; echo the end" }]], 'done');
  say('s', 'go');
  await run({ harness: 'h', session: 's', cwd, once: true, model });

  const answer = shown.at(-1).messages.find((message) => message.role === 'tool').content;
  const path = answer.match(/is in (.+?); read it there in parts/)[1];
  assert.match(answer, /^\[the whole answer, 3 lines and 50009 characters, is in /);
  assert.ok(answer.length < 30_000 && answer.endsWith('the end\n'), 'the context gets the two ends');
  assert.equal(readFileSync(path, 'utf8').length, 50009, 'the file has all of it');
  assert.equal(await bare('read').run({ path, offset: 2, limit: 1 }, blocks(cwd)), 'the end', 'and the bare read tool can page through it');
});

test('compaction clears the oldest bulky text first and keeps it all in files; the first message and the tail stay whole', async () => {
  const { home } = sandbox();
  const dir = join(home, 'session');
  const messages = [{ role: 'user', content: 'go' }];
  for (const [i, letter] of [...'abcde'].entries()) messages.push(...exchange(`c${i}`, 'bash', { command: `make ${letter}` }, i === 1 ? `error: boom\n${'b'.repeat(4000)}` : letter.repeat(4000)));
  const write = exchange('w', 'write', { path: 'src/big.ts', content: 'w'.repeat(5000) }, 'wrote src/big.ts');
  write[0].reasoning = 'r'.repeat(1000);
  messages.push(...write, ...exchange('last', 'bash', { command: 'make f' }, 'f'.repeat(4000)));
  const model = summarising(async () => assert.fail('clearing was enough; nothing is summarised'));
  const { context, entry } = await compaction.compact({ model: 'm', system: 'S', tools: [], messages }, { limit: 6000 }, { model, dir, n: 9, ordinal: 1, by: 'base', trigger: 'limit' });

  const answers = context.messages.filter((message) => message.role === 'tool').map((message) => message.content);
  assert.match(answers[0], /^\[cleared by the base: bash\(\{"command":"make a"\}\) answered 4000 characters, with no error; the whole answer is in (.+c0\.txt)\]$/);
  assert.equal(readFileSync(answers[0].match(/is in (.+)\]$/)[1], 'utf8'), 'a'.repeat(4000));
  assert.match(answers[1], /failing: error: boom/);
  assert.equal(answers.at(-1), 'f'.repeat(4000), 'the tail stays whole');
  assert.equal(context.messages[0].content, 'go');
  const written = context.messages.find((message) => message.tool_calls?.[0].id === 'w');
  assert.deepEqual(JSON.parse(written.tool_calls[0].function.arguments), { path: 'src/big.ts', content: '[cleared by the base: 5000 characters]' });
  assert.ok(!('reasoning' in written), 'old reasoning is dropped');
  assert.deepEqual([entry.cleared.answers, entry.cleared.arguments, entry.cleared.reasoning, entry.summarised], [5, 1, 1, undefined]);
  assert.ok(entry.after <= 3000 && entry.before > 6000);
  assert.equal(messages[2].content, 'a'.repeat(4000), 'the context it was given is left as it was');
});

test("when clearing is not enough, the model summarises a fork of the live request; the human's words and the trail are the base's", async () => {
  const { home } = sandbox();
  const dir = join(home, 'session');
  const messages = [{ role: 'user', content: 'go' }];
  for (let i = 0; i < 4; i++) messages.push({ role: 'user', content: `U${i}`.repeat(1500) }, { role: 'assistant', content: `A${i}`.repeat(1500) });
  const live = { model: 'm', system: 'S', tools: [{ type: 'function', function: { name: 'bash', description: '', parameters: {} } }], messages };
  const model = summarising(async () => assert.fail('only the summary is asked for'));
  const calls = [{ block: 'tool', call: { function: { name: 'edit', arguments: JSON.stringify({ path: 'src/a.ts' }) } }, result: 'edited src/a.ts' }, { block: 'tool', call: { function: { name: 'bash', arguments: '{"command":"npm test"}' } }, result: 'not ok 1\n[exit 1]' }];
  const arrived = [{ from: 'user', at: 'now', text: 'keep the old API, please' }, { from: 'base', at: 'now', text: 'not the human' }];
  const { context, entry } = await compaction.compact(live, { limit: 2000, pinned: 'never push to main' }, { model, dir, n: 4, ordinal: 2, by: 'base', trigger: 'limit', calls, arrived });

  assert.equal(model.asked.length, 1);
  assert.deepEqual(model.asked[0].context, live, 'a fork of the live request, so reading the history is a cache hit');
  const [first, summary, ack, ...tail] = context.messages;
  assert.equal(first.content, 'go');
  assert.match(summary.content, /^\[base\] Compaction 2 of this session\. Messages 2 to 8 were summarised/);
  assert.match(summary.content, /## Goal\n- noted/);
  assert.match(summary.content, /--- written by the base from the record, not by the model ---\n\n## Pinned\nnever push to main/);
  assert.match(summary.content, /## What the human said, newest first\n- turn 4: keep the old API, please\n\n/);
  assert.match(summary.content, /## Files changed\n- src\/a\.ts, turn 4/);
  assert.match(summary.content, /## Calls that failed\n- turn 4: bash\(\{"command":"npm test"\}\): not ok 1$/);
  assert.equal(ack.role, 'assistant');
  assert.deepEqual(tail, messages.slice(8));
  assert.deepEqual([entry.summarised.from, entry.summarised.to, entry.cost], [2, 8, 0.005]);
});

test("a summary the base cannot use is asked for once more, then the base writes its own; compaction never stops the loop", async () => {
  const { home } = sandbox();
  const messages = [{ role: 'user', content: 'go' }, ...exchange('c1', 'bash', { command: 'ls' }, 'short'), { role: 'user', content: 'x'.repeat(8000) }, { role: 'assistant', content: 'y'.repeat(4000) }];
  const model = summarising(async () => assert.fail('only the summary is asked for'), 'no headings here');
  const { context, entry } = await compaction.compact({ model: 'm', system: 'S', tools: [], messages }, { limit: 1000 }, { model, dir: join(home, 's'), n: 1, ordinal: 1, by: 'base', trigger: 'limit' });

  assert.equal(model.asked.length, 2);
  assert.match(entry.summarised.fallback, /lacked headings/);
  assert.match(context.messages[1].content, /so the base wrote this one\. The calls made in the summarised messages, oldest first:\n- bash\(\{"command":"ls"\}\)/);
});

test('past its limit the base compacts before the model call, stops when it comes too often, and the record keeps everything', async () => {
  const { cwd, harness } = sandbox();
  harnessFile(harness, 'config.json', JSON.stringify({ contextLimit: 3000 }));
  const big = (letter) => [['bash', { command: `printf '${letter}%.0s' $(seq 1 3000)` }]];
  const { model: answers, shown } = scripted(...'abcdefgh'.split('').map(big), 'done');
  say('s', 'go');
  await run({ harness: 'h', session: 's', cwd, once: true, model: summarising(answers) });

  const record = read(sessionDir('h', 's'));
  const passes = record.flatMap((entry) => entry.calls.filter((call) => call.block === 'compact'));
  assert.ok(passes.length >= 1);
  assert.deepEqual([passes[0].by, passes[0].trigger, passes[0].ordinal], ['base', 'limit', 1]);
  const last = shown.at(-1).messages;
  assert.equal(last[0].content, 'go', 'the first message stays');
  assert.equal(last.filter((message) => message.role === 'tool').at(-1).content, 'h'.repeat(3000), 'and the newest answer');
  assert.equal(last.filter((message) => String(message.content).startsWith('[base] Your context passed its limit')).length, 1, 'the guard tells the agent once');
  assert.ok(record.some((entry) => entry.context.messages.some((message) => message.content === 'a'.repeat(3000))), 'the record keeps every answer whole');
});

test('a request the provider refuses as too long is compacted to half, then a third, and sent again', async () => {
  const { cwd } = sandbox();
  const big = (letter) => [['bash', { command: `printf '${letter}%.0s' $(seq 1 20000)` }]];
  const { model: answers } = scripted(big('a'), big('b'), big('c'), 'done');
  const model = async (context, prompt) => {
    if (JSON.stringify(context.messages).length > 45_000) throw Object.assign(new Error('the model call failed (400): maximum context length exceeded'), { status: 400 });
    return answers(context, prompt);
  };
  say('s', 'go');
  await run({ harness: 'h', session: 's', cwd, once: true, model: summarising(model) });

  const record = read(sessionDir('h', 's'));
  assert.ok(record.every((entry) => !entry.failed) && record.some((entry) => entry.response?.content === 'done'), 'the session went on to the end');
  const passes = record.flatMap((entry) => entry.calls.filter((call) => call.block === 'compact'));
  assert.ok(passes.length >= 1 && passes.every((pass) => pass.trigger === 'overflow'));
});

test("a harness's turn can compact with the base's building block, and the record says it did", async () => {
  const { cwd, harness } = sandbox();
  harnessFile(harness, 'turn.ts', `export async function turn(context, response, arrived, base) {
  const step = await base.turn(context, response, arrived);
  return { ...step, context: await base.compact(step.context, { limit: 1, target: 1, summarise: false }) };
}`);
  const { model } = scripted([['bash', { command: "printf 'q%.0s' $(seq 1 500)" }]], [['bash', { command: 'echo two' }]], 'done');
  say('s', 'go');
  await run({ harness: 'h', session: 's', cwd, once: true, model });

  const passes = read(sessionDir('h', 's')).flatMap((entry) => entry.calls.filter((call) => call.block === 'compact'));
  assert.ok(passes.some((pass) => pass.trigger === 'turn' && pass.by.startsWith('turn@') && pass.cleared.answers === 1));
});

test('the record keeps the commit each turn starts from, when the work is a git repository', async () => {
  const { cwd } = sandbox();
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).stdout.trim();
  git('init', '-q');
  writeFileSync(join(cwd, 'a.txt'), 'a');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  const { model } = scripted([['bash', { command: 'echo b > b.txt' }]], 'done');
  say('s', 'go');
  await run({ harness: 'h', session: 's', cwd, once: true, task: 'T1', model });

  const record = read(sessionDir('h', 's'));
  assert.deepEqual(record.map((entry) => entry.work.dirty), [0, 0, 1], 'as each turn starts: the file the second turn writes shows in the third');
  assert.ok(record.every((entry) => entry.work.commit === git('rev-parse', 'HEAD')));
  assert.deepEqual(analytics.attribute(analytics.sessions('h')).tasks[0].commits, [git('rev-parse', 'HEAD')]);
});

test("the human's review: approved and rated, or rejected and reopened; analytics counts the cost to approval", async () => {
  const { home, cwd } = sandbox();
  const fake = await provider(() => says('ok'));
  try {
    const first = cli(home, cwd, fake.url, ['chat', 'h', 'build it', '--session', 's', '--task', 'T1', '--once']);
    assert.equal(await first.exit, 0, first.err);
    const reject = cli(home, cwd, fake.url, ['chat', 'h', '/reject the totals are off', '--session', 's', '--once']);
    assert.equal(await reject.exit, 0, reject.err);
    const approve = cli(home, cwd, fake.url, ['chat', 'h', '/approve 4 much better', '--session', 's', '--once']);
    assert.equal(await approve.exit, 0, approve.err);
    const unreadable = cli(home, cwd, fake.url, ['chat', 'h', '/rate great', '--session', 's', '--once']);
    assert.equal(await unreadable.exit, 2);
    assert.match(unreadable.err, /rate with a number from 1 to 5/);
  } finally {
    fake.close();
  }

  const items = read(sessionDir('h', 's')).flatMap((entry) => entry.arrived).filter((item) => item.review);
  assert.deepEqual(items.map((item) => [item.from, item.text]), [['review', 'The human rejected the work: the totals are off'], ['review', 'The human approved the work and rated it 4 of 5: much better']]);
  assert.deepEqual(items[1].review, { verdict: 'approved', rating: 4, note: 'much better' });
  const [task] = analytics.attribute(analytics.sessions('h')).tasks;
  assert.deepEqual([task.task, task.rejections, task.rating, +task.toApproval.toFixed(3), +task.cost.toFixed(3)], ['T1', 1, 4, 0.004, 0.006], 'what it cost up to the approval, not the turn that read it');
  assert.match(analytics.report('h'), /T1: approved for \$0\.0040, rated 4 after 1 rejections/);
});

test('analytics counts what each task took, from the task a session was started for or claimed, and every version of its tools', async () => {
  const { cwd, harness } = sandbox();
  const probe = "export const description = 'Checks the work';\nexport const parameters = { type: 'object', properties: {} };\nexport const run = () => 'all good';";
  say('a', 'work on T1');
  await run({ harness: 'h', session: 'a', cwd, once: true, task: 'T1', model: scripted([['write', { path: join(harness, 'tools/probe.ts'), content: probe }]], [['probe', {}]]).model });
  say('b', 'pick something up');
  await run({ harness: 'h', session: 'b', cwd, once: true, model: scripted(
    [['bash', { command: 'echo idle task --id T2 --status claimed' }]],
    [['bash', { command: 'echo working' }]],
    [['bash', { command: 'echo idle task --id T2 --status submitted' }]],
    [['bash', { command: 'echo after it' }]],
  ).model });

  const all = analytics.sessions('h');
  const { tasks, unattributed } = analytics.attribute(all);
  const t1 = tasks.find((t) => t.task === 'T1');
  const t2 = tasks.find((t) => t.task === 'T2');
  assert.deepEqual([t1.turns, +t1.cost.toFixed(2), t1.attempts, t1.sessions], [3, 0.03, 1, ['a']]);
  assert.deepEqual([t2.turns, +t2.cost.toFixed(2), t2.attempts, t2.submits, t2.sessions], [3, 0.03, 1, 1, ['b']], 'from the claim through the submit');
  assert.deepEqual([unattributed.turns, +unattributed.cost.toFixed(2), unattributed.sessions], [2, 0.02, ['b']], 'and nothing after it');
  assert.equal(read(sessionDir('h', 'a'))[0].task, 'T1', 'the record names the task');

  const [version] = analytics.controlLoops(all);
  assert.deepEqual([version.tool, version.session, version.uses, version.problems, version.tasks], ['probe', 'a', 1, 0, ['T1']]);
  assert.match(analytics.report('h'), /T1: not approved · \$0\.0300, 3 turns/);
});

test('the session survives an unreadable inbox file and a folder git cannot save', async () => {
  const { cwd, harness } = sandbox();
  versions.init(harness);
  harnessFile(harness, 'notes.md', 'a change');
  writeFileSync(join(harness, '.git', 'index.lock'), ''); // as if another session were saving at this moment
  mkdirSync(join(sessionDir('h', 's'), 'inbox'), { recursive: true });
  writeFileSync(join(sessionDir('h', 's'), 'inbox', '0-garbage.json'), '{ not json');
  const { model, shown } = scripted('still here');
  say('s', 'go');
  await run({ harness: 'h', session: 's', cwd, once: true, model });

  const record = read(sessionDir('h', 's'));
  assert.match(record[0].version, /^unsaved-/);
  assert.match(said(shown[0]), /could not be read and was dropped: 0-garbage\.json/);
  assert.match(said(shown[0]), /Saving a version of your folder failed/);
  assert.equal(record[0].response.content, 'still here');
});

test('one session runs one loop', () => {
  const { home } = sandbox();
  const dir = join(home, 'session');
  mkdirSync(dir);
  const release = claim(dir);
  assert.equal(holder(dir), process.pid);
  assert.throws(() => claim(dir), /already running, in process/);
  release();
  assert.equal(holder(dir), null);
  writeFileSync(join(dir, 'lock'), '999999999'); // left behind by a process that is gone
  claim(dir)();
});

test('inbox items keep their order, and the follower never cuts a character in two', async () => {
  const { home } = sandbox();
  const dir = join(home, 'session');
  for (let i = 0; i < 50; i++) send(dir, 'user', String(i));
  const { items } = await take(dir, false);
  assert.deepEqual(items.map((item) => item.text), Array.from({ length: 50 }, (_, i) => String(i)));

  const news = follower(dir);
  const line = Buffer.from(`${JSON.stringify({ response: { content: 'Grüße' } })}\n`);
  const cut = line.indexOf(Buffer.from('ü')) + 1;
  appendFileSync(join(dir, 'record.jsonl'), line.subarray(0, cut));
  assert.deepEqual(news(), []);
  appendFileSync(join(dir, 'record.jsonl'), line.subarray(cut));
  assert.equal(news()[0].response.content, 'Grüße');
});

test('the bare tools: missing arguments, repeated text, a background job, a timeout', async () => {
  const { cwd } = sandbox();
  writeFileSync(join(cwd, 'f.txt'), 'keep DROP keep');
  assert.equal(bare('edit').run({ path: 'f.txt', old_string: 'DROP ' }, blocks(cwd)), 'error: new_string is missing (got path, old_string)');
  assert.equal(bare('edit').run({ path: 'f.txt', old: 'DROP ', new: '' }, blocks(cwd)), 'edited f.txt', 'the names other harnesses use work too');
  writeFileSync(join(cwd, 'f.txt'), 'keep DROP keep');
  assert.match(bare('edit').run({ path: 'f.txt', old_string: 'keep', new_string: '' }, blocks(cwd)), /occurs 2 times/);
  assert.equal(readFileSync(join(cwd, 'f.txt'), 'utf8'), 'keep DROP keep');

  let started = Date.now();
  assert.equal(await bare('bash').run({ command: 'sleep 5 & echo started' }, blocks(cwd)), 'started\n');
  assert.ok(Date.now() - started < 2000, 'a job left in the background does not hold the call');
  started = Date.now();
  assert.match(await bare('bash').run({ command: 'echo begun; sleep 5; echo never', timeout: 1 }, blocks(cwd)), /^begun\n\n\[stopped after 1s\]/);
  assert.ok(Date.now() - started < 3000);
});

test('versions: going back restores the folder and is itself a version; the user\'s git config has no say', () => {
  const { home, harness } = sandbox();
  // A global config that would hide new files and every .json from git.
  writeFileSync(join(home, 'ignore'), '*.json\n');
  writeFileSync(join(home, 'gitconfig'), `[status]\n\tshowUntrackedFiles = no\n[core]\n\texcludesFile = ${join(home, 'ignore')}\n`);
  process.env.GIT_CONFIG_GLOBAL = join(home, 'gitconfig');
  try {
    versions.init(harness);
    const empty = versions.save(harness, 'nothing yet');
    harnessFile(harness, 'turn.ts', 'export const turn = 1;');
    harnessFile(harness, 'config.json', '{}');
    const changed = versions.save(harness, 'a change');
    assert.notEqual(changed, empty);
    assert.match(versions.show(harness, changed), /config\.json[\s\S]*turn\.ts/);

    const back = versions.restore(harness, empty);
    assert.ok(!existsSync(join(harness, 'turn.ts')));
    assert.equal(versions.list(harness).split('\n').length, 3);
    versions.restore(harness, changed);
    assert.ok(existsSync(join(harness, 'turn.ts')), 'and forward again: nothing was lost');
    assert.notEqual(back, changed);
    assert.throws(() => versions.restore(harness, '--oops'), /name a version/);
  } finally {
    delete process.env.GIT_CONFIG_GLOBAL;
  }
});

test('a session picks up where its record ends', async () => {
  const { cwd } = sandbox();
  const first = scripted('one');
  say('s', 'first');
  await run({ harness: 'h', session: 's', cwd, once: true, model: first.model });

  const second = scripted('two');
  say('s', 'second');
  await run({ harness: 'h', session: 's', cwd: '/elsewhere', once: true, model: second.model });

  assert.equal(said(second.shown[0]), 'first\none\nsecond');
  const record = read(sessionDir('h', 's'));
  assert.deepEqual(record.map((entry) => entry.n), [0, 1, 2, 3]);
  assert.equal(record.at(-1).cwd, cwd, 'and stays where it was working');
});

// A stand-in for OpenRouter: answers every chat completion with `answer(request)`.
async function provider(answer) {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const [status, json] = answer(JSON.parse(body), request);
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(json));
    });
  });
  await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
const says = (content) => [200, { choices: [{ message: { role: 'assistant', content } }], usage: { cost: 0.002 } }];
const asks = (name, args) => [200, { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `c-${Date.now()}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }], usage: { cost: 0.001 } }];

// Runs the command line with its own user space, pointed at a stand-in provider.
function cli(home, cwd, url, args, input) {
  const env = { ...process.env, IDLE_HOME: home, OPENROUTER_API_KEY: 'test-key', IDLE_HARNESS_API: url, IDLE_HARNESS_MODEL: 'some/model' };
  const child = spawn(process.execPath, [join(root, 'bin/idle-harness.mjs'), ...args], { cwd, env });
  const result = { out: '', err: '', child };
  child.stdout.on('data', (data) => { result.out += data; });
  child.stderr.on('data', (data) => { result.err += data; });
  if (input !== undefined) child.stdin.end(input);
  result.exit = new Promise((exited) => child.on('exit', (code) => exited(code)));
  return result;
}
const until = async (check) => { for (let i = 0; i < 100 && !check(); i++) await new Promise((tick) => setTimeout(tick, 100)); assert.ok(check()); };

test('a model call sends what the model is shown and brings back the cost', async () => {
  const seen = [];
  const fake = await provider((body, request) => {
    seen.push({ body, key: request.headers.authorization });
    if (body.model === 'refused') return [400, { error: { message: 'no such model' } }];
    // OpenRouter reports a provider failing behind it inside an answer that started out fine.
    if (body.model === 'flaky' && seen.filter((s) => s.body.model === 'flaky').length === 1) return [200, { error: { code: 408, message: 'Provider timed out after 33710ms' } }];
    return [200, { choices: [{ message: { role: 'assistant', content: 'hi', tool_calls: [] } }], usage: { prompt_tokens: 9, cost: 0.5 } }];
  });
  Object.assign(process.env, { OPENROUTER_API_KEY: 'test-key', IDLE_HARNESS_API: fake.url });
  try {
    const context = { model: 'some/model', system: 'be brief', tools: [], messages: [{ role: 'user', content: 'earlier' }] };
    const reply = await model(context, [{ role: 'user', content: 'now' }]);
    assert.deepEqual(reply, { message: { role: 'assistant', content: 'hi' }, usage: { prompt_tokens: 9, cost: 0.5 }, cost: 0.5 });
    assert.equal(seen[0].key, 'Bearer test-key');
    assert.deepEqual(seen[0].body.messages.map((message) => message.content), ['be brief', 'earlier', 'now']);
    assert.equal(seen[0].body.tools, undefined);
    await assert.rejects(model({ ...context, model: 'refused' }, []), (error) => error.status === 400 && /no such model/.test(error.message));
    assert.equal(seen.length, 2, 'a refused request is not tried again');
    assert.equal((await model({ ...context, model: 'flaky' }, [])).message.content, 'hi', 'a provider failing behind OpenRouter is tried again');
  } finally {
    fake.close();
  }
});

test('the key and the default model can live in ~/.idle/config.json; the environment overrides them', async () => {
  const { home, cwd } = sandbox();
  writeFileSync(join(home, 'config.json'), JSON.stringify({ openrouter: { apiKey: 'from-config' }, harness: { model: 'config/model' } }));
  const seen = [];
  const fake = await provider((body, request) => { seen.push([request.headers.authorization, body.model]); return says('ok'); });
  const saved = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, IDLE_HARNESS_MODEL: process.env.IDLE_HARNESS_MODEL, IDLE_HARNESS_API: process.env.IDLE_HARNESS_API };
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.IDLE_HARNESS_MODEL;
  process.env.IDLE_HARNESS_API = fake.url;
  try {
    say('s', 'hi');
    await run({ harness: 'h', session: 's', cwd, once: true });
    Object.assign(process.env, { OPENROUTER_API_KEY: 'from-env', IDLE_HARNESS_MODEL: 'env/model' });
    say('s', 'again');
    await run({ harness: 'h', session: 's', cwd, once: true });
    assert.deepEqual(seen, [['Bearer from-config', 'config/model'], ['Bearer from-env', 'env/model']]);
  } finally {
    for (const [name, value] of Object.entries(saved)) value === undefined ? delete process.env[name] : (process.env[name] = value);
    fake.close();
  }
});

test('the front end talks to a session that runs as its own process; --once fails when the model does', async () => {
  const { home, cwd } = sandbox();
  const fake = await provider((body) => (body.messages.at(-1).content === 'break' ? [400, { error: { message: 'bad' } }] : says('hello from the model')));
  try {
    const ok = cli(home, cwd, fake.url, ['chat', 'h', 'hi', 'there', '--once']);
    assert.equal(await ok.exit, 0, ok.err);
    assert.equal(ok.out, 'hello from the model\n');
    assert.match(ok.err, /session \S+ · 2 turns · \$0\.0020/);

    const broken = cli(home, cwd, fake.url, ['chat', 'h', 'break', '--once']);
    assert.equal(await broken.exit, 1);
    assert.match(broken.err, /the model call failed \(400\): bad/);
  } finally {
    fake.close();
  }
});

test('when the input ends, the session finishes what it was asked, then the command ends', async () => {
  const { home, cwd } = sandbox();
  const seen = [];
  const fake = await provider((body) => { seen.push(body.messages.filter((m) => m.role === 'user').map((m) => m.content)); return says('got it'); });
  try {
    const piped = cli(home, cwd, fake.url, ['chat', 'h'], 'first line\nsecond line\n');
    assert.equal(await piped.exit, 0, piped.err);
    assert.equal(piped.out, 'got it\n');
    assert.deepEqual(seen, [['first line', 'second line']], 'both lines, in order, in one turn');
  } finally {
    fake.close();
  }
});

test('stopping a session in the middle of a turn writes it down as stopped; the session goes on from there', async () => {
  const { home, cwd } = sandbox();
  const seen = [];
  const fake = await provider((body) => {
    seen.push(body.messages.at(-1));
    return body.messages.at(-1).content === 'go' ? asks('bash', { command: 'sleep 30' }) : says('carrying on');
  });
  try {
    const first = cli(home, cwd, fake.url, ['chat', 'h', 'go', '--session', 's']);
    await until(() => seen.length === 1);
    await new Promise((tick) => setTimeout(tick, 300)); // the sleep is running now
    first.child.kill('SIGTERM');
    assert.equal(await first.exit, 143);
    const stopped = read(sessionDir('h', 's')).at(-1);
    assert.equal(stopped.stopped, 'SIGTERM');
    assert.match(stopped.context.messages.at(-1).content, /stopped \(SIGTERM\) before it finished/);
    assert.equal(holder(sessionDir('h', 's')), null, 'the lock went with the process');

    const next = cli(home, cwd, fake.url, ['chat', 'h', 'next', '--session', 's', '--once']);
    assert.equal(await next.exit, 0, next.err);
    assert.equal(next.out, 'carrying on\n');
    assert.equal(seen.length, 2, 'the stopped command was not run again');
  } finally {
    fake.close();
  }
});

test('a session run with --once ends when its work is done, even with a server one of its tools left open', async () => {
  const { home, cwd, harness } = sandbox();
  harnessFile(harness, 'tools/serve.ts', "import { createServer } from 'node:http';\nexport const description = 'Starts a server';\nexport const parameters = { type: 'object', properties: {} };\nexport async function run() { await new Promise((ready) => createServer(() => {}).listen(0, '127.0.0.1', ready)); return 'serving'; }");
  const fake = await provider((body) => (body.messages.some((message) => message.role === 'tool') ? says('done') : asks('serve', {})));
  const once = cli(home, cwd, fake.url, ['chat', 'h', 'go', '--once']);
  try {
    assert.equal(await Promise.race([once.exit, new Promise((later) => setTimeout(() => later('still running'), 8000))]), 0, once.err);
  } finally {
    once.child.kill();
    fake.close();
  }
});

test('a second front end on a running session talks to it instead of starting another loop', async () => {
  const { home, cwd } = sandbox();
  const fake = await provider((body) => says(`heard: ${body.messages.at(-1).content}`));
  try {
    const first = cli(home, cwd, fake.url, ['chat', 'h', 'one', '--session', 's']);
    await until(() => first.out.includes('heard: one'));
    const second = cli(home, cwd, fake.url, ['chat', 'h', '--session', 's']);
    second.child.stdin.write('two\n');
    await until(() => first.out.includes('heard: two') && second.out.includes('heard: two'));
    const once = cli(home, cwd, fake.url, ['chat', 'h', 'three', '--session', 's', '--once']);
    assert.equal(await once.exit, 2);
    assert.match(once.err, /already running; talk to it without --once/);

    const ns = read(sessionDir('h', 's')).map((entry) => entry.n);
    assert.deepEqual(ns, [...new Set(ns)], 'every turn number once: one loop');
    second.child.stdin.end();
    assert.equal(await second.exit, 0);
    first.child.kill('SIGTERM');
    await first.exit;
  } finally {
    fake.close();
  }
});

test('a tool call a turn builds in its own shape runs, is recorded in the usual one, and leaves no session behind', async () => {
  const { home, cwd, harness } = sandbox();
  harnessFile(harness, 'turn.ts', `export async function turn(context, response, arrived, base) {
  if (!response) await base.tool({ name: 'bash', arguments: { command: 'echo odd > odd.txt' } });
  return base.turn(context, response, arrived);
}`);
  const fake = await provider(() => says('fine'));
  try {
    const odd = cli(home, cwd, fake.url, ['chat', 'h', 'go', '--session', 's', '--once']);
    assert.equal(await odd.exit, 0, odd.err);
    assert.equal(readFileSync(join(cwd, 'odd.txt'), 'utf8'), 'odd\n');
    const [call] = read(sessionDir('h', 's'))[0].calls;
    assert.deepEqual(call.call, { id: 'base-1', type: 'function', function: { name: 'bash', arguments: '{"command":"echo odd > odd.txt"}' } });
    assert.equal(holder(sessionDir('h', 's')), null);
  } finally {
    fake.close();
  }
});
