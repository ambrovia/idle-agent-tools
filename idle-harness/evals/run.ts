// Runs evals through a real model: each scenario a few times, in throwaway harnesses, the way a user would.
//
//   node idle-harness/evals/run.ts [E1 E2 …] [--runs <n>] [--keep] [--structure open|session|frozen] [--improvement plain|weighed|platform] [--seed] [--no-sandbox]
//
// Every run writes its result to evals/results/. --keep leaves the harnesses and the project copy in place.
// --structure says what becomes of the changes working sessions make to their harness (see Structure); --improvement
// what an improvement session is given (see Improvement). --seed starts the harness as one specialised on the work
// would start, where the eval says what that is. Sessions run sandboxed unless --no-sandbox (see sandbox).

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnessDir, sessionDir } from '../src/home.ts';
import { holder } from '../src/record.ts';
import * as versions from '../src/versions.ts';
import { ledger, platform, Run, told, weighed } from './scenario.ts';
import type { Check, Improvement, Scenario, Structure } from './scenario.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const bin = join(here, '..', 'bin', 'idle-harness.mjs');

// Each session runs in a sandbox of its own (macOS sandbox-exec). It cannot read or write the eval itself — its
// fixtures, hidden tests and services — nor the harnesses and projects of other runs, and it cannot signal a process
// outside its own sandbox. A harness that closes its loops probes whatever it can reach: unsandboxed, the E18
// sessions read the service's source in fixtures/ and killed each other's services.
const escape = (path: string) => path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function sandbox(run: Run): string[] {
  if (!sandboxed) return [];
  const harnesses = realpathSync(join(harnessDir(run.name), '..'));
  const temp = realpathSync(tmpdir());
  const places = [run.cwd, ...run.places.values()].map((place) => realpathSync(place));
  const profile = [
    '(version 1)',
    '(allow default)',
    `(deny file-read* file-write* (subpath "${realpathSync(here)}"))`,
    `(deny file-read* file-write* (regex #"^${escape(harnesses)}/eval-"))`,
    `(allow file-read* file-write* (regex #"^${escape(harnesses)}/${escape(run.name)}(-[a-z0-9]+)?(/|$)"))`,
    `(deny file-read* file-write* (regex #"^${escape(temp)}/eval-"))`,
    ...places.map((place) => `(allow file-read* file-write* (subpath "${place}"))`),
    '(deny signal)',
    '(allow signal (target same-sandbox))',
  ].join('\n');
  return ['sandbox-exec', '-p', profile];
}

// One session: the plain front end with --once, as a user would start it. Too long counts as failed, and so does
// a session whose loop is still running after its front end ended: the run would read it half-done.
function session(run: Run, cwd: string, harness: string, n: number, message: string, minutes: number): Promise<{ code: number | null; timedOut: boolean; leftRunning: boolean }> {
  return new Promise((done) => {
    const [command, ...args] = [...sandbox(run), process.execPath, bin, 'chat', harness, message, '--session', `s${n}`, '--once'];
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, minutes * 60_000);
    child.stderr.on('data', (data) => process.stderr.write(`    ${String(data).replace(/\n(?!$)/g, '\n    ')}`));
    child.on('exit', async (code) => {
      clearTimeout(timer);
      await new Promise((settle) => setTimeout(settle, 500)); // the session's own process ends just after its front end
      const pid = holder(sessionDir(harness, `s${n}`));
      if (pid) process.kill(pid, 'SIGTERM');
      done({ code, timedOut, leftRunning: Boolean(pid) });
    });
  });
}

// The project starts as a fresh git repository, so a check can see what the harness changed.
function project(name: string, cwd: string) {
  cpSync(join(here, 'projects', name), cwd, { recursive: true });
  const git = (...args: string[]) => spawnSync('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@localhost', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'the project as the eval starts it');
}

// Where changes do not stay, the agent is told so with its message.
const notice = {
  work: ' Changes you make to your harness folder last for this session only: afterwards it goes back to how it was, and improvement sessions decide what stays.',
  improvement: " Working sessions' own changes to the harness lasted for their session only; they are in your version history (the versions tool), for you to take up where the evidence across sessions supports them.",
};

const sum = (entries: any[]) => +entries.reduce((total, entry) => total + (entry.cost ?? 0), 0).toFixed(4);

async function once(scenario: Scenario, attempt: number, keep: boolean, structure: Structure, improvement: Improvement, seeded: boolean) {
  const run = new Run(`eval-${scenario.id.toLowerCase()}-${Date.now().toString(36)}-${attempt}`, '');
  run.cwd = mkdtempSync(join(tmpdir(), `${run.name}-`));
  run.structure = structure;
  run.improvement = improvement;
  const started = Date.now();
  project(scenario.project, run.cwd);
  await scenario.setup?.(run);
  if (seeded) scenario.seed?.(run);
  const sessions: Awaited<ReturnType<typeof session>>[] = [];
  const minutes = scenario.minutes ?? 15;
  const fresh = (step: Scenario['steps'][number]): step is string | { message: string; harness?: string; improve?: boolean; in?: string } =>
    typeof step === 'string' || (typeof step === 'object' && 'message' in step && !(structure === 'frozen' && step.improve));
  const messages = scenario.steps.filter(fresh).length;
  // Where changes do not stay, the harness goes back once the task is done, reopenings included.
  let done: (() => void) | null = null;
  const finish = () => { done?.(); done = null; };
  for (const step of scenario.steps) {
    if (typeof step === 'function') { finish(); await step(run); continue; }
    if (typeof step === 'object' && 'reopen' in step) {
      const n = run.sessions.size;
      const why = n ? step.reopen(run, n) : null;
      if (!why) continue;
      run.reopened.set(n, (run.reopened.get(n) ?? 0) + 1);
      process.stderr.write(`  session ${n} reopened\n`);
      const again = await session(run, run.where.get(n)!, run.sessions.get(n)!, n, why, minutes);
      sessions[n - 1] = { code: again.code ?? sessions[n - 1].code, timedOut: sessions[n - 1].timedOut || again.timedOut, leftRunning: sessions[n - 1].leftRunning || again.leftRunning };
      continue;
    }
    if (!fresh(step)) continue;
    finish();
    const { message, harness, improve, in: place } = typeof step === 'string' ? { message: step, harness: undefined, improve: false, in: undefined } : step;
    if (place && !run.places.has(place)) {
      run.places.set(place, mkdtempSync(join(tmpdir(), `${run.name}-${place.replace(/\W/g, '-')}-`)));
      project(place.split('#')[0], run.places.get(place)!);
    }
    const n = run.sessions.size + 1;
    run.sessions.set(n, run.harnessName(harness));
    run.where.set(n, run.at(place));
    if (improve) run.improvements.add(n);
    process.stderr.write(`  session ${n}/${messages}${harness ? ` in harness ${harness}` : ''}${place ? ` in ${place}` : ''}${improve ? ' (improvement)' : ''}\n`);
    if (structure !== 'open') {
      const dir = harnessDir(run.harnessName(harness));
      versions.init(dir);
      const before = versions.save(dir, 'as the eval left it');
      if (structure === 'frozen' || !improve) done = () => { versions.restore(dir, before); };
    }
    const given = !improve ? '' : improvement === 'weighed' ? weighed(run, n) : improvement === 'platform' ? platform(run, n) : '';
    sessions.push(await session(run, run.at(place), run.harnessName(harness), n, `${message}${structure === 'open' ? '' : improve ? notice.improvement : notice.work}${given}`, minutes));
  }
  finish();
  let checks: Check[];
  try {
    checks = await scenario.check(run);
  } catch (error: any) {
    checks = [{ name: 'the checks could run', pass: false, detail: String(error?.message ?? error) }];
  }
  await scenario.teardown?.(run);
  const unclean = sessions.flatMap((s, i) => (s.timedOut ? [`s${i + 1} timed out`] : s.leftRunning ? [`s${i + 1} kept running after its front end ended`] : s.code ? [`s${i + 1} exited with ${s.code}`] : []));
  checks.unshift({ name: 'every session ended cleanly', pass: !unclean.length, ...(unclean.length ? { detail: unclean.join(', ') } : {}) });
  // How often a session reached outside its run and the sandbox stopped it.
  const stopped = [...run.sessions.keys()].flatMap((n) => run.records(n)).flatMap((entry) => entry.calls ?? []).filter((call: any) => call.block === 'tool' && /Operation not permitted/.test(String(call.result ?? ''))).length;
  if (sandboxed) checks.push({ name: 'reaches outside the run the sandbox stopped', pass: null, detail: `${stopped} tool calls` });
  const entries = [...run.sessions.keys()].flatMap((n) => run.records(n));
  const changes = ledger(run);
  const result = {
    eval: scenario.id, title: scenario.title, intents: scenario.intents, structure, improvement, seeded, sandboxed, attempt, harness: run.name, project: run.cwd, places: Object.fromEntries(run.places),
    at: new Date(started).toISOString(), minutes: +((Date.now() - started) / 60_000).toFixed(1),
    model: entries.find((entry) => entry.model)?.model ?? null,
    cost: +(sum(entries) + run.readingCost).toFixed(4), readingCost: +run.readingCost.toFixed(4),
    turns: entries.length, calls: entries.filter((entry) => entry.usage).length, tookOver: entries.filter((entry) => entry.threw).length,
    sessions: sessions.map((s, i) => ({ n: i + 1, harness: run.sessions.get(i + 1), improvement: run.improvements.has(i + 1), reopened: run.reopened.get(i + 1) ?? 0, exit: s.code, timedOut: s.timedOut, leftRunning: s.leftRunning, turns: run.records(i + 1).length, cost: sum(run.records(i + 1)) })),
    checks, passed: checks.every((c) => c.pass !== false),
    changes, // when, where and how the harness changed
  };
  mkdirSync(join(here, 'results'), { recursive: true });
  writeFileSync(join(here, 'results', `${result.at.replace(/[:.]/g, '-')}-${scenario.id}-${attempt}.json`), `${JSON.stringify(result, null, 2)}\n`);
  if (!keep) {
    for (const harness of new Set([run.name, ...run.sessions.values()])) rmSync(harnessDir(harness), { recursive: true, force: true });
    for (const key of ['b']) rmSync(run.dir(key), { recursive: true, force: true }); // a harness set up between sessions but never run
    for (const place of [run.cwd, ...run.places.values()]) rmSync(place, { recursive: true, force: true });
  }
  return result;
}

const args = process.argv.slice(2);
const option = (flag: string) => { const at = args.indexOf(flag); return at < 0 ? undefined : args.splice(at, flag === '--keep' ? 1 : 2).at(-1); };
const keep = option('--keep') !== undefined;
const sandboxed = !(args.includes('--no-sandbox') && args.splice(args.indexOf('--no-sandbox'), 1)) && existsSync('/usr/bin/sandbox-exec');
const seeded = args.includes('--seed') && Boolean(args.splice(args.indexOf('--seed'), 1));
const runs = Number(option('--runs') ?? 1);
const structure = (option('--structure') ?? 'open') as Structure;
if (!['open', 'session', 'frozen'].includes(structure)) throw new Error('--structure is open, session or frozen');
const improvement = (option('--improvement') ?? 'plain') as Improvement;
if (!['plain', 'weighed', 'platform'].includes(improvement)) throw new Error('--improvement is plain, weighed or platform');
const variant = [structure === 'open' ? '' : structure, improvement === 'plain' ? '' : improvement, seeded ? 'seeded' : ''].filter(Boolean).join(', ');
const files = readdirSync(join(here, 'scenarios')).filter((file) => file.endsWith('.ts')).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
const scenarios: Scenario[] = [];
for (const file of files) scenarios.push((await import(join(here, 'scenarios', file))).default);
const chosen = args.length ? scenarios.filter((s) => args.map((a) => a.toUpperCase()).includes(s.id)) : scenarios;

for (const scenario of chosen) {
  const results = [];
  for (let attempt = 1; attempt <= runs; attempt++) {
    process.stderr.write(`${scenario.id} ${scenario.title} — run ${attempt}/${runs}${variant ? `, ${variant}` : ''}\n`);
    const result = await once(scenario, attempt, keep, structure, improvement, seeded);
    results.push(result);
    process.stdout.write(`${scenario.id}${variant ? ` (${variant})` : ''} run ${attempt}: ${result.passed ? 'PASS' : 'FAIL'} · ${result.turns} turns · $${result.cost.toFixed(4)} · ${result.minutes} min${result.tookOver ? ` · base took over ${result.tookOver}×` : ''}\n`);
    for (const c of result.checks) process.stdout.write(`  ${c.pass === null ? '·' : c.pass ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}\n`);
    for (const line of told(result.changes)) process.stdout.write(`    ${line}\n`);
    if (keep) process.stdout.write(`  kept: harness ${result.harness}, project ${result.project}\n`);
  }
  const passed = results.filter((r) => r.passed).length;
  process.stdout.write(`${scenario.id} ${scenario.title}: passed ${passed}/${runs} · $${results.reduce((total, r) => total + r.cost, 0).toFixed(4)}\n\n`);
}
