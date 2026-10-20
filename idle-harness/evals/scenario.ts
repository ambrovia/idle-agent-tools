// What an eval is, and what it can look at once its sessions have run.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnessDir, sessionDir, user } from '../src/home.ts';
import { controlLoops } from '../src/analytics.ts';
import { model } from '../src/model.ts';
import { read } from '../src/record.ts';

// One finding of an eval. An eval passes when all of them do; `pass: null` is reported, never passed or failed.
export type Check = { name: string; pass: boolean | null; detail?: string };

// One step of an eval: a message for a new session — of the run's harness or of another harness of the run (named by
// a short key), for improvement, in the run's project or in another (`in`: a folder of projects/, with `#key` for a
// second copy) — a task reopened in the session just run when `reopen` returns why, or something the eval does between
// sessions, such as leaving a comment.
export type Step =
  | string
  | { message: string; harness?: string; improve?: boolean; in?: string }
  | { reopen(run: Run, n: number): string | null }
  | ((run: Run) => void | Promise<void>);

// How a run treats what working sessions change in their harness. open keeps it, as the base does today. session puts
// the harness back after every working session's task, so only improvement sessions change what the next task starts
// with. frozen puts it back after every session and skips improvement: the baseline in which nothing is learned.
export type Structure = 'open' | 'session' | 'frozen';

// What an improvement session is given beyond its message. plain: nothing; it reads the records itself. weighed: a
// rule that every part of the harness has to pay for itself, and each earlier session's numbers to weigh it with.
// platform: the platform loop's rule — formalise the most valuable of the sensors working sessions built, take out
// what never fires — and a ledger of those sensors.
export type Improvement = 'plain' | 'weighed' | 'platform';

export type Scenario = {
  id: string;
  title: string;
  intents: string[]; // the intents in INTENT.md it shows
  project: string; // a folder under evals/projects/, copied fresh for every run
  minutes?: number; // how long one session may take before the run counts as failed; 15 if not given
  setup?(run: Run): void | Promise<void>; // the harness's starting state, before the first step
  seed?(run: Run): void; // with --seed: what a harness specialised on this work would start with, after setup
  teardown?(run: Run): void | Promise<void>; // after the checks: stops whatever setup started
  steps: Step[]; // in order; each message is a session of its own, answered with --once
  check(run: Run): Check[] | Promise<Check[]>;
};

// One run of a scenario: throwaway harnesses and a fresh copy of the project.
export class Run {
  name: string; // the run's harness; another harness of the run is `${name}-${key}`
  cwd: string; // the project copy
  sessions = new Map<number, string>(); // which harness ran session n
  improvements = new Set<number>(); // which sessions were for improvement
  reopened = new Map<number, number>(); // how often the task of session n was reopened
  places = new Map<string, string>(); // other project copies of the run, by the `in` that named them
  where = new Map<number, string>(); // the project copy session n worked in
  structure: Structure = 'open';
  improvement: Improvement = 'plain';
  readingCost = 0; // what the model readers of `ask` cost

  constructor(name: string, cwd: string) {
    this.name = name;
    this.cwd = cwd;
  }

  harnessName(key?: string) { return key ? `${this.name}-${key}` : this.name; }

  dir(key?: string) { return harnessDir(this.harnessName(key)); }

  get harness() { return this.dir(); }

  // The record of session n, counting from 1 across the run, with whole contexts.
  records(n: number): any[] { return read(sessionDir(this.sessions.get(n) ?? this.name, `s${n}`)); }

  // The last thing the model said in session n.
  reply(n: number): string {
    return this.records(n).map((entry) => entry.response?.content).filter(Boolean).at(-1) ?? '';
  }

  // The run's project copy, or another one named by `in`.
  at(place?: string) { return place ? this.places.get(place) ?? '' : this.cwd; }

  // A shell command in the project, or in another copy.
  sh(command: string, place?: string): { code: number; out: string } {
    const result = spawnSync('bash', ['-c', command], { cwd: this.at(place), encoding: 'utf8' });
    return { code: result.status ?? 1, out: `${result.stdout}${result.stderr}` };
  }

  private git(key: string | undefined, ...args: string[]) {
    const shown = spawnSync('git', args, { cwd: this.dir(key), encoding: 'utf8' });
    return shown.status === 0 ? shown.stdout : null;
  }

  // A file in a harness folder as it is now, or at a version; null when it is not there.
  file(path: string, version?: string, key?: string): string | null {
    if (version) return this.git(key, 'show', `${version}:${path}`);
    try { return readFileSync(join(this.dir(key), path), 'utf8'); } catch { return null; }
  }

  // Every file in a harness folder's latest version, or in an earlier one.
  files(key?: string, version?: string): string[] {
    return ((version ? this.git(key, 'ls-tree', '-r', '--name-only', version) : this.git(key, 'ls-files')) ?? '').trim().split('\n').filter(Boolean);
  }

  // The folder session n worked on: its own copy of the harness, or the harness itself for an improvement session.
  own(n: number): string {
    const copy = join(sessionDir(this.sessions.get(n) ?? this.name, `s${n}`), 'harness');
    return existsSync(copy) ? copy : harnessDir(this.sessions.get(n) ?? this.name);
  }

  // The versions of a harness folder, oldest first, with the message each was saved under: the harness's own and the
  // working sessions' on their branches.
  versions(key?: string): { version: string; message: string }[] {
    return (this.git(key, 'log', '--all', '--reverse', '--format=%h %s') ?? '').trim().split('\n').filter(Boolean)
      .map((line) => ({ version: line.slice(0, line.indexOf(' ')), message: line.slice(line.indexOf(' ') + 1) }));
  }

  // What changed in a harness folder between two versions, as a patch.
  diff(from: string, to: string, key?: string): string { return this.git(key, 'diff', from, to) ?? ''; }

  // Only where a finding cannot be read in code: a model reads the material and answers each question true or false.
  async ask(questions: Record<string, string>, material: string): Promise<{ answers: Record<string, boolean>; why: string }> {
    const keys = Object.keys(questions);
    const prompt = `Answer each question about the material below with true or false.\n\n${keys.map((key) => `${key}: ${questions[key]}`).join('\n')}\n\nAnswer with JSON only: {${keys.map((key) => `"${key}": true or false`).join(', ')}, "why": "one or two sentences"}\n\nThe material:\n<<<\n${material}\n>>>`;
    const context = { model: process.env.IDLE_HARNESS_MODEL || user().harness?.model || '', system: 'You read what a software agent did and wrote, and answer questions about it strictly and literally.', tools: [], messages: [] };
    const reply = await model(context, [{ role: 'user', content: prompt }]);
    this.readingCost += reply.cost ?? 0;
    const text = String(reply.message.content ?? '');
    let parsed: any = {};
    try { parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { /* counts as all false */ }
    return { answers: Object.fromEntries(keys.map((key) => [key, parsed[key] === true])), why: String(parsed.why ?? text.slice(0, 300)) };
  }
}

export const check = (name: string, pass: boolean | null, detail?: string): Check => ({ name, pass, ...(detail ? { detail } : {}) });

// What one model call cost on average across these entries; null when none reported a cost.
export function costPerCall(entries: any[]): number | null {
  const calls = entries.filter((entry) => typeof entry.cost === 'number' && entry.usage);
  return calls.length ? calls.reduce((sum, entry) => sum + entry.cost, 0) / calls.length : null;
}

// The share of prompt tokens served from the provider's cache across these entries. Unlike cost per call,
// it does not depend on how long a task ran.
export function cacheHit(entries: any[]): number | null {
  const calls = entries.filter((entry) => entry.usage?.prompt_tokens);
  const prompt = calls.reduce((sum, entry) => sum + entry.usage.prompt_tokens, 0);
  return prompt ? calls.reduce((sum, entry) => sum + (entry.usage.prompt_tokens_details?.cached_tokens ?? 0), 0) / prompt : null;
}

// How many model calls a session made: the measure of how many turns a task took.
export const calls = (entries: any[]) => entries.filter((entry) => entry.usage).length;

// The tool calls of a session that worked on the harness rather than on the task: anything naming the harness folder,
// and the versions tool. The project copy's own path starts with the harness's name, so the folder is matched with
// its parent.
export function harnessWork(entries: any[], name: string): { calls: number; of: number } {
  const all = entries.flatMap((entry) => entry.response?.tool_calls ?? []);
  const own = all.filter((call: any) => call.function?.name === 'versions' || String(call.function?.arguments ?? '').includes(`harness/${name}`));
  return { calls: own.length, of: all.length };
}

// The project's own tests, as one finding.
export function testsPass(run: Run, place?: string): Check {
  const tests = run.sh('node --test --test-reporter=tap', place);
  return check("the project's tests pass", tests.code === 0, tests.out.split('\n').filter((line) => /^# (pass|fail) /.test(line)).join(', '));
}

// Where a change to a harness landed.
const surface = (path: string) => (path === 'turn.ts' ? 'turn' : path.startsWith('tools/') ? 'tool' : path.startsWith('skills/') ? 'skill'
  : path === 'config.json' ? 'settings' : /\.(md|txt)$/i.test(path) ? 'notes' : 'code');

// What one session changed in its harness: the files, whether each lasted to the end of the run, and how often later
// sessions called a tool it made or named a file it wrote.
export type Change = {
  session: number;
  improvement: boolean;
  files: { path: string; surface: string; added: number; removed: number; lasted: boolean; usedLater: number }[];
  restores: number; // times it put its folder back to an earlier version
};

// When, where and how a run's harness changed, session by session.
export function ledger(run: Run, key?: string): Change[] {
  const log = spawnSync('git', ['log', '--all', '--reverse', '--format=%x01%h %s', '--numstat'], { cwd: run.dir(key), encoding: 'utf8' }).stdout ?? '';
  const end = new Set(run.files(key));
  const changes = new Map<number, Change>();
  const at = (n: number) => changes.get(n) ?? changes.set(n, { session: n, improvement: run.improvements.has(n), files: [], restores: 0 }).get(n)!;
  const sessions = [...run.sessions.keys()].filter((n) => run.sessions.get(n) === run.harnessName(key));
  const later = (n: number) => sessions.filter((m) => m > n).flatMap((m) => run.records(m).flatMap((entry) => entry.response?.tool_calls ?? []));
  for (const commit of log.split('\x01').filter(Boolean)) {
    const [head, ...lines] = commit.trim().split('\n');
    const version = head.slice(0, head.indexOf(' '));
    const made = head.match(/ s(\d+) turn \d+$/);
    if (!made) {
      // A going back the session itself asked for shows in its records after its first turn.
      const by = sessions.find((n) => run.records(n).slice(1).some((entry) => entry.version === version));
      if (by && / back to /.test(head)) at(by).restores++;
      continue;
    }
    const n = Number(made[1]);
    for (const line of lines.filter(Boolean)) {
      const [added, removed, path] = line.split('\t');
      const calls = later(n);
      const name = path.replace(/^tools\//, '').replace(/\.ts$/, '');
      const usedLater = surface(path) === 'tool' ? calls.filter((call: any) => call.function?.name === name).length
        : calls.filter((call: any) => String(call.function?.arguments ?? '').includes(path.split('/').at(-1)!)).length;
      const known = at(n).files.find((file) => file.path === path);
      if (known) { known.added += Number(added) || 0; known.removed += Number(removed) || 0; continue; }
      at(n).files.push({ path, surface: surface(path), added: Number(added) || 0, removed: Number(removed) || 0, lasted: end.has(path), usedLater });
    }
  }
  return [...changes.values()].sort((a, b) => a.session - b.session);
}

// The ledger as lines to read.
export const told = (changes: Change[]) => changes.map((c) => `s${c.session} ${c.improvement ? 'improvement' : 'work'}: ${
  c.files.map((f) => `${f.surface} ${f.path} +${f.added}−${f.removed}${f.lasted ? '' : ' (gone at the end)'}${f.usedLater ? `, used ${f.usedLater}× later` : ''}`).join('; ') || 'no files'}${c.restores ? `; went back ${c.restores}×` : ''}`);

// The bare tools' names, to tell a harness's own tools apart in a record.
const BARE = new Set(['read', 'write', 'edit', 'bash', 'versions']);

// For a weighed improvement session: the rule, and one line of numbers per earlier session of the same harness.
export function weighed(run: Run, n: number): string {
  const lines = [...run.sessions.keys()].filter((m) => m < n && run.sessions.get(m) === run.sessions.get(n)).map((m) => {
    const entries = run.records(m);
    const cost = entries.reduce((total, entry) => total + (entry.cost ?? 0), 0);
    const hit = cacheHit(entries);
    const work = harnessWork(entries, run.sessions.get(m)!);
    const own = new Map<string, number>();
    for (const call of entries.flatMap((entry) => entry.response?.tool_calls ?? [])) {
      const name = call.function?.name;
      if (name && !BARE.has(name)) own.set(name, (own.get(name) ?? 0) + 1);
    }
    return `s${m}${run.improvements.has(m) ? ' (improvement)' : ''}: ${calls(entries)} model calls, $${cost.toFixed(4)}, ${hit === null ? 'no' : `${Math.round(hit * 100)}%`} of prompt tokens from cache, ${work.calls} of ${work.of} tool calls on the harness${own.size ? `, its own tools: ${[...own].map(([name, count]) => `${name} ×${count}`).join(', ')}` : ''}`;
  });
  return `\n\nEvery part of the harness is paid for on every task. Keep or make a change only where the numbers say it pays: tasks cheaper or better by more than it costs. Shrink or remove what has not paid for itself. Each earlier session in numbers:\n${lines.join('\n')}`;
}

// Every version of a tool the sessions of a harness built before session n (see controlLoops), and how the tasks of
// the sessions that used it went: right the first time, or reopened.
export type Variant = { tool: string; session: number; buildCost: number; lines: number; uses: number; answerChars: number; problems: number; tasks: { right: number; of: number } };
export function variants(run: Run, n: number): Variant[] {
  const earlier = [...run.sessions.keys()].filter((m) => m < n && run.sessions.get(m) === run.sessions.get(n)).sort((a, b) => a - b);
  return controlLoops(earlier.map((m) => ({ id: `s${m}`, entries: run.records(m) }))).map((loop) => {
    const used = loop.usedIn.map((id) => Number(id.slice(1))).filter((m) => !run.improvements.has(m));
    return { ...loop, session: Number(loop.session.slice(1)), tasks: { right: used.filter((m) => !run.reopened.get(m)).length, of: used.length } };
  });
}

// For a platform improvement session: the rule, and the ledger of every version of every sensor the earlier sessions
// built, and whether the tool is in the harness now.
export function platform(run: Run, n: number): string {
  const key = run.sessions.get(n) === run.name ? undefined : run.sessions.get(n)!.slice(run.name.length + 1);
  const now = new Set(run.files(key).filter((f) => f.startsWith('tools/')).map((f) => f.slice(6, -3)));
  const lines = variants(run, n).map((v) => `${v.tool} as built in s${v.session} (${v.lines || '?'} lines, $${v.buildCost.toFixed(4)} to build): used ${v.uses}×${v.uses ? `, answers ${Math.round(v.answerChars / v.uses)} characters on average, reported a problem ${v.problems}×, tasks that used it right the first time ${v.tasks.right} of ${v.tasks.of}` : ''}${now.has(v.tool) ? '; a version of it is in the harness now' : ''}`);
  return `\n\nYou are the platform loop. Working sessions build sensors and simulations for themselves as they work — checks, probes, fakes, helpers that show them the result of what they do — each its own version, some better and cheaper than others. Find the ones worth having across sessions: built again and again, used often, reporting problems that were then fixed, cheap to run. Of the versions, keep the one that did the job best for least, or merge the best of them. Formalise it: one stable tool in the harness with a stated purpose and checks of its own, and where it pays, run it from your turn so that it runs without being asked. Take out what never fires. One or two such steps, not an overhaul. Every version the earlier sessions built:\n${lines.join('\n') || 'none yet'}`;
}

// The eval's own tests of what the tasks asked for, in evals/acceptance/, where the harness cannot see them: a quality
// floor it cannot fake by writing fewer or easier tests.
export function accepts(run: Run, name: string, place?: string): Check {
  const file = fileURLToPath(new URL(`acceptance/${name}.mjs`, import.meta.url));
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { cwd: run.at(place), env: { ...process.env, PROJECT: run.at(place) }, encoding: 'utf8' });
  const out = `${result.stdout}${result.stderr}`;
  const failed = out.split('\n').filter((line) => line.startsWith('not ok')).map((line) => line.replace(/^not ok \d+ - /, ''));
  return check(`what the tasks asked for holds (hidden tests${place ? ` in ${place}` : ''})`, result.status === 0, result.status === 0 ? out.match(/^# pass \d+/m)?.[0] : failed.join('; ') || out.slice(-300));
}

// Whether one of the eval's hidden tests passes, for a requester who reopens a task that does not do what was asked.
export function passing(run: Run, name: string, test: string): boolean {
  const file = fileURLToPath(new URL(`acceptance/${name}.mjs`, import.meta.url));
  const pattern = `^${test.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
  return spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=${pattern}`, file], { cwd: run.cwd, env: { ...process.env, PROJECT: run.cwd }, encoding: 'utf8' }).status === 0;
}

// Asks a work session to look back at the end, until a harness does that on its own.
export const withRetrospective = (task: string) =>
  `${task} When you are done, write a short retrospective of this task: what went well or badly, and why — as a matter of process or tools.`;

export const IMPROVE = { improve: true, message: 'This session is for improvement, not for a task. Look back over your earlier sessions — their records are in .sessions in your harness folder, one entry per turn with usage, cost and what you wrote, including the retrospectives at the end of each — and improve how you work where the evidence across them supports it. Keep the step small, and say what you changed, why, and what you expect it to improve.' };
