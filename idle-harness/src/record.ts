// A session's files: the record, the inbox, and the lock that keeps one loop per session.
// A front end is anything that can write to the inbox and follow the record.

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Context } from './model.ts';

// The human's answer to a piece of work: approved, with a rating from 1 to 5 now or later, or rejected with the reason.
// task: the idle-tasks task it is for, when the human named it.
export type Review = { verdict: 'approved' | 'rejected' | 'rated'; rating?: number; note: string; task?: string };

// One thing that arrived in the inbox.
export type Item = { from: string; at: string; text: string; review?: Review };

const file = (dir: string) => join(dir, 'record.jsonl');
const inbox = (dir: string) => join(dir, 'inbox');
const lock = (dir: string) => join(dir, 'lock');
const now = () => new Date().toISOString();

// A line cut off by a crash is not an entry.
function entries(text: string): any[] {
  return text.split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

// A turn's context mostly repeats the one before it, so only the messages after the shared start are written.
export function append(dir: string, entry: Record<string, any>, before?: Context) {
  const context: Context | undefined = entry.context;
  let keep = 0;
  if (before && context) {
    const most = Math.min(before.messages.length, context.messages.length);
    const same = (i: number) => before.messages[i] === context.messages[i] || JSON.stringify(before.messages[i]) === JSON.stringify(context.messages[i]);
    while (keep < most && same(keep)) keep++;
  }
  const written = keep ? { ...entry, keep, context: { ...context, messages: context!.messages.slice(keep) } } : entry;
  appendFileSync(file(dir), `${JSON.stringify(written)}\n`);
}

// Every entry with its whole context again: the kept messages come from the entry before.
export function read(dir: string): any[] {
  const list = existsSync(file(dir)) ? entries(readFileSync(file(dir), 'utf8')) : [];
  list.forEach((entry, i) => {
    if (entry.keep) entry.context.messages = [...list[i - 1].context.messages.slice(0, entry.keep), ...entry.context.messages];
    delete entry.keep;
  });
  return list;
}

// Reads the entries added since the last call, as they were written. `fromEnd` skips what is already there.
// Lines are split as bytes and decoded whole, so a character is never cut in two.
export function follower(dir: string, fromEnd = false): () => any[] {
  let at = fromEnd && existsSync(file(dir)) ? statSync(file(dir)).size : 0;
  let rest = Buffer.alloc(0);
  return () => {
    const size = existsSync(file(dir)) ? statSync(file(dir)).size : 0;
    if (size <= at) return [];
    const chunk = Buffer.alloc(size - at);
    const fd = openSync(file(dir), 'r');
    readSync(fd, chunk, 0, chunk.length, at);
    closeSync(fd);
    at = size;
    const data = Buffer.concat([rest, chunk]);
    const end = data.lastIndexOf(10);
    rest = data.subarray(end + 1);
    return end < 0 ? [] : entries(data.subarray(0, end).toString('utf8'));
  };
}

// One file per item, written whole and then renamed into place, so several senders never collide.
// The counter keeps the order of items one process sends within the same millisecond.
let sent = 0;
export function send(dir: string, from: string, text: string, review?: Review) {
  mkdirSync(inbox(dir), { recursive: true });
  const name = `${Date.now()}-${String(sent++).padStart(6, '0')}-${process.pid}.json`;
  const item: Item = { from, at: now(), text, ...(review ? { review } : {}) };
  writeFileSync(join(inbox(dir), `.${name}`), JSON.stringify(item));
  renameSync(join(inbox(dir), `.${name}`), join(inbox(dir), name));
}

const waiting = (dir: string) => (existsSync(inbox(dir)) ? readdirSync(inbox(dir)).filter((name) => !name.startsWith('.')).sort() : []);

// How many items are waiting to be taken.
export const pending = (dir: string) => waiting(dir).length;

// Hands over what arrived, oldest first. The items stay until `done`, so a turn that is cut off gets them again.
// A file that cannot be read is handed over as a note, then dropped with the rest.
export async function take(dir: string, wait: boolean): Promise<{ items: Item[]; done: () => void }> {
  for (;;) {
    const names = waiting(dir);
    if (names.length || !wait) {
      const item = (name: string): Item => {
        try { return JSON.parse(readFileSync(join(inbox(dir), name), 'utf8')); } catch { return { from: 'base', at: now(), text: `An inbox item could not be read and was dropped: ${name}` }; }
      };
      return { items: names.map(item), done: () => names.forEach((name) => rmSync(join(inbox(dir), name), { force: true })) };
    }
    await new Promise((tick) => setTimeout(tick, 100));
  }
}

// The process running this session's loop, if it is still alive.
export function holder(dir: string): number | null {
  let pid: number;
  try { pid = Number(readFileSync(lock(dir), 'utf8')); } catch { return null; }
  if (!(pid > 0)) return null;
  try { process.kill(pid, 0); return pid; } catch (error: any) { return error.code === 'EPERM' ? pid : null; }
}

// One loop per session. A lock left by a process that is gone is taken over. The owner also tidies the record:
// a line cut off by a crash gets its line break, so the next entry is not glued to it.
export function claim(dir: string): () => void {
  const me = String(process.pid);
  try {
    writeFileSync(lock(dir), me, { flag: 'wx' });
  } catch {
    const pid = holder(dir);
    if (pid) throw new Error(`the session is already running, in process ${pid}`);
    rmSync(lock(dir), { force: true });
    writeFileSync(lock(dir), me, { flag: 'wx' }); // fails if another process took it over first
  }
  if (existsSync(file(dir)) && !readFileSync(file(dir), 'utf8').endsWith('\n') && statSync(file(dir)).size) appendFileSync(file(dir), '\n');
  const release = () => { try { if (readFileSync(lock(dir), 'utf8') === me) rmSync(lock(dir)); } catch { /* already gone */ } };
  process.on('exit', release);
  return () => { process.off('exit', release); release(); };
}
