// The tools a turn can call: the base's bare ones, and how a harness's own tools join them.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ToolSpec } from './model.ts';
import type { Blocks } from './turn.ts';
import * as versions from './versions.ts';

// What the model is told about a tool, and what runs when it calls it. The result is what the model reads back.
export type Tool = { spec: ToolSpec; run(args: any, base: Blocks): Promise<unknown> | unknown };

// Long output is cut in the middle: the start says what ran, the end says how it went.
const MAX = 30_000;
const clip = (text: string) => (text.length <= MAX ? text : `${text.slice(0, MAX / 2)}\n… cut …\n${text.slice(-MAX / 2)}`);

// Commands run in their own process group, so a timeout or the end of the session stops everything they started,
// background jobs included.
const running = new Set<number>();
const stop = (pid: number) => { try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ } };
process.on('exit', () => running.forEach(stop));

function bash(command: string, timeout: number | undefined, base: Blocks): Promise<string> {
  return new Promise((done) => {
    const child = spawn('bash', ['-c', command], { cwd: base.cwd, env: { ...process.env, IDLE_BY: `harness/${base.name}@${base.version}` }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let out = '';
    let finished = false;
    const finish = (end: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      for (const stream of [child.stdout, child.stderr]) (stream as any).unref?.(); // what is left in the background may not keep the process alive
      done(clip(`${out}${end}`) || '(no output)');
    };
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8'); // decodes across chunks, so a character is never cut in two
      stream.on('data', (data: string) => {
        if (finished) return; // a background job still writing is drained, not read
        out += data;
        if (out.length > 4 * MAX) out = clip(out);
      });
    }
    if (child.pid) running.add(child.pid);
    const timer = timeout ? setTimeout(() => { out += `\n[stopped after ${timeout}s]`; stop(child.pid!); }, timeout * 1000) : undefined;
    // The shell exiting is the end, even while a job it left in the background keeps the output open.
    child.on('exit', (code) => setTimeout(() => finish(code ? `\n[exit ${code}]` : ''), 100));
    child.on('close', (code) => { running.delete(child.pid!); finish(code ? `\n[exit ${code}]` : ''); });
    child.on('error', (error) => finish(`error: ${error.message}`));
  });
}

// A bare tool says what is missing, and what it got instead, rather than writing "undefined" into a file.
// Aliases take the names other harnesses use for the same argument.
function tool(name: string, description: string, properties: Record<string, object>, required: string[], run: (a: any, base: Blocks) => unknown, aliases: Record<string, string> = {}): Tool {
  return {
    spec: { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } },
    run: (given, base) => {
      const a = { ...given };
      for (const [alias, key] of Object.entries(aliases)) if (a[key] === undefined && a[alias] !== undefined) a[key] = a[alias];
      const missing = required.find((key) => typeof a?.[key] !== 'string');
      return missing ? `error: ${missing} is missing (got ${Object.keys(given ?? {}).join(', ') || 'nothing'})` : run(a, base);
    },
  };
}

const text = { type: 'string' };
const at = (base: Blocks, path: string) => resolve(base.cwd, path);

export const BARE: Tool[] = [
  tool('read', 'Read a text file.', { path: text, offset: { type: 'number', description: 'first line, counting from 1' }, limit: { type: 'number', description: 'how many lines' } }, ['path'], (a, base) => {
    const lines = readFileSync(at(base, a.path), 'utf8').split('\n');
    const first = Math.max(1, a.offset ?? 1) - 1;
    return clip(lines.slice(first, a.limit ? first + a.limit : undefined).join('\n'));
  }),
  tool('write', 'Write a file, creating its folders. Replaces what is there.', { path: text, content: text }, ['path', 'content'], (a, base) => {
    mkdirSync(dirname(at(base, a.path)), { recursive: true });
    writeFileSync(at(base, a.path), a.content);
    return `wrote ${a.path}`;
  }),
  tool('edit', 'Replace one exact piece of text in a file: old_string must occur in it exactly once.', { path: text, old_string: text, new_string: text }, ['path', 'old_string', 'new_string'], (a, base) => {
    const before = readFileSync(at(base, a.path), 'utf8');
    const count = a.old_string ? before.split(a.old_string).length - 1 : 0;
    if (count !== 1) return `error: the text occurs ${count} times in ${a.path}; it must occur exactly once`;
    writeFileSync(at(base, a.path), before.replace(a.old_string, () => a.new_string));
    return `edited ${a.path}`;
  }, { old: 'old_string', new: 'new_string' }),
  tool('bash', 'Run a shell command. There is no time limit unless you set one. A job left in the background runs until the session ends.', { command: text, timeout: { type: 'number', description: 'seconds' } }, ['command'], (a, base) => bash(a.command, a.timeout, base)),
  tool('versions', 'Earlier versions of your harness folder: list them, show what one changed, or restore the folder to one.', { action: { type: 'string', enum: ['list', 'show', 'restore'] }, version: text }, ['action'], (a, base) => {
    if (a.action === 'list') return versions.list(base.harness);
    if (a.action === 'show') return clip(versions.show(base.harness, a.version));
    if (a.action === 'restore') return `the folder is back at ${a.version}; that is now version ${versions.restore(base.harness, a.version)}`;
    return 'error: action is list, show or restore';
  }),
];

// Bare tools a harness cannot replace: the way back to an earlier version stays the base's.
export const KEPT = new Set(['versions']);

// The tools a turn can call: the bare ones, and the harness's own, which replace bare ones of the same name.
export function registry(own: Tool[]): Tool[] {
  const mine = own.filter((t) => !KEPT.has(t.spec.function.name));
  const names = new Set(mine.map((t) => t.spec.function.name));
  return [...BARE.filter((t) => !names.has(t.spec.function.name)), ...mine];
}
