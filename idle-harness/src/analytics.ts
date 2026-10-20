// What improvement learns from, read from a harness's session records every time and never kept: per task, what it
// took to get there; per control loop — a tool a session built for itself — what each version cost and did.
// Approval and the human's rating live in idle-tasks; the cost to an approved solution is a task's cost up to them.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { harnessDir } from './home.ts';
import { read } from './record.ts';
import { BARE } from './tools.ts';

export type Session = { id: string; entries: any[] };

// What one task took: everything spent while it was the task in hand, across sessions and harness versions.
export type TaskTook = { task: string; cost: number; turns: number; input: number; cached: number; output: number; sessions: string[]; versions: string[]; attempts: number; submits: number; first: string; last: string };

// One version of a tool a session wrote, with what it cost to write and what it did afterwards.
export type LoopVersion = { tool: string; session: string; buildCost: number; lines: number; uses: number; answerChars: number; problems: number; usedIn: string[]; tasks: string[] };

const BARE_NAMES = new Set(BARE.map((tool) => tool.spec.function.name));

// What a tool's answer looks like when it reports a problem, and not when it reports none ("# fail 0").
const PROBLEM = /\bfail(?:ed|s|ure)?\b(?!:? ?0\b)|error\b|mismatch|incomplete|"complete": ?false|not ok|✗|differ|missing|wrong/i;

export function sessions(harness: string): Session[] {
  const dir = join(harnessDir(harness), '.sessions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((id) => ({ id, entries: read(join(dir, id)) })).filter((s) => s.entries.length)
    .sort((a, b) => String(a.entries[0].at).localeCompare(String(b.entries[0].at)));
}

// A change of a task's status in idle-tasks, as a call in the record shows it: the idle command line through bash,
// or an idle tool's arguments.
function taskMove(call: any): { task: string; status: string } | null {
  const name = String(call?.function?.name ?? '');
  const args = String(call?.function?.arguments ?? '');
  let text = args;
  try { const parsed = JSON.parse(args); text = name === 'bash' ? String(parsed.command ?? '') : JSON.stringify(parsed); } catch { /* not JSON */ }
  if (name === 'bash' && !/\bidle\s+task\b/.test(text)) return null;
  if (name !== 'bash' && !/(^|_)(idle|task)$/.test(name)) return null;
  const task = text.match(/--id[ =]+["']?([\w.-]+)/)?.[1] ?? text.match(/"id":\s*"([\w.-]+)"/)?.[1];
  const status = text.match(/--status[ =]+["']?(\w+)/)?.[1] ?? text.match(/"status":\s*"(\w+)"/)?.[1];
  return task && status ? { task, status } : null;
}

// Which task each turn belongs to: the task the session was started for, or the one it claimed, until it submits or
// lets it go. Turns with no task are unattributed and stay so.
export function attribute(all: Session[]): { tasks: TaskTook[]; unattributed: { cost: number; turns: number; sessions: string[] } } {
  const tasks = new Map<string, TaskTook>();
  const unattributed = { cost: 0, turns: 0, sessions: new Set<string>() };
  const at = (task: string, when: string) => tasks.get(task) ?? tasks.set(task, { task, cost: 0, turns: 0, input: 0, cached: 0, output: 0, sessions: [], versions: [], attempts: 0, submits: 0, first: when, last: when }).get(task)!;
  for (const session of all) {
    const bound: string | undefined = session.entries[0]?.task; // the task the session was started for, if any
    let current = bound;
    if (current) at(current, session.entries[0].at).attempts++;
    for (const entry of session.entries) {
      const holder = current;
      const moves = (entry.response?.tool_calls ?? []).map(taskMove).filter(Boolean) as { task: string; status: string }[];
      for (const move of moves.filter((m) => m.status === 'claimed' && m.task !== current)) { current = move.task; at(current, entry.at).attempts++; }
      const charged = current ?? holder;
      const cost = entry.cost ?? 0;
      if (!charged) {
        unattributed.cost += cost;
        if (entry.usage) unattributed.turns++;
        unattributed.sessions.add(session.id);
      } else {
        const took = at(charged, entry.at);
        took.cost += cost;
        if (entry.usage) took.turns++;
        took.input += entry.usage?.prompt_tokens ?? 0;
        took.cached += entry.usage?.prompt_tokens_details?.cached_tokens ?? 0;
        took.output += entry.usage?.completion_tokens ?? 0;
        if (!took.sessions.includes(session.id)) took.sessions.push(session.id);
        if (entry.version && !took.versions.includes(entry.version)) took.versions.push(entry.version);
        took.last = entry.at;
      }
      for (const move of moves) {
        if (move.status === 'submitted') at(move.task, entry.at).submits++;
        // Submitted or let go: the session is back on the task it was started for, or on none.
        if (move.task === current && ['submitted', 'open', 'blocked', 'done', 'archived'].includes(move.status)) current = bound === move.task ? undefined : bound;
      }
    }
  }
  return { tasks: [...tasks.values()], unattributed: { cost: unattributed.cost, turns: unattributed.turns, sessions: [...unattributed.sessions] } };
}

// Every version of every tool the sessions wrote: a session that writes tools/<name>.ts makes a version of it, and the
// calls to that tool until the next version count for it.
export function controlLoops(all: Session[]): LoopVersion[] {
  const { tasks } = attribute(all);
  const taskOf = (session: string) => tasks.filter((t) => t.sessions.includes(session)).map((t) => t.task);
  const versions: LoopVersion[] = [];
  const latest = new Map<string, LoopVersion>();
  for (const session of all) {
    for (const entry of session.entries) {
      for (const call of entry.calls ?? []) {
        if (call.block !== 'tool') continue;
        const name = String(call.call?.function?.name ?? '');
        const args = String(call.call?.function?.arguments ?? '');
        const path = args.match(/tools\/([\w-]+)\.ts/)?.[1];
        if ((name === 'write' || name === 'edit') && path) {
          let version = latest.get(path);
          if (!version || version.session !== session.id) {
            version = { tool: path, session: session.id, buildCost: 0, lines: 0, uses: 0, answerChars: 0, problems: 0, usedIn: [], tasks: [] };
            versions.push(version);
            latest.set(path, version);
          }
          version.buildCost += entry.cost ?? 0;
          if (name === 'write') try { version.lines = String(JSON.parse(args).content ?? '').split('\n').length; } catch { /* not JSON */ }
        }
        const version = name && !BARE_NAMES.has(name) ? latest.get(name) : undefined;
        if (!version) continue;
        version.uses++;
        version.answerChars += String(call.result ?? '').length;
        if (PROBLEM.test(String(call.result ?? ''))) version.problems++;
        if (!version.usedIn.includes(session.id)) version.usedIn.push(session.id);
      }
    }
  }
  for (const version of versions) version.tasks = [...new Set(version.usedIn.flatMap(taskOf))];
  return versions;
}

// Per version of the harness: how many turns ran on it and what they cost.
export function byVersion(all: Session[]): { version: string; turns: number; cost: number; first: string }[] {
  const out = new Map<string, { version: string; turns: number; cost: number; first: string }>();
  for (const entry of all.flatMap((s) => s.entries)) {
    if (!entry.version) continue;
    const row = out.get(entry.version) ?? out.set(entry.version, { version: entry.version, turns: 0, cost: 0, first: entry.at }).get(entry.version)!;
    if (entry.usage) row.turns++;
    row.cost += entry.cost ?? 0;
  }
  return [...out.values()].sort((a, b) => a.first.localeCompare(b.first));
}

// The whole reading, for the human: as text, or as JSON for whatever reads it next.
export function report(harness: string, json = false): string {
  const all = sessions(harness);
  const { tasks, unattributed } = attribute(all);
  const loops = controlLoops(all);
  const versions = byVersion(all);
  if (json) return JSON.stringify({ harness, tasks, unattributed, loops, versions }, null, 2);
  const money = (n: number) => `$${n.toFixed(4)}`;
  const share = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : '-');
  return [
    `${harness}: ${all.length} sessions, ${money(all.flatMap((s) => s.entries).reduce((t, e) => t + (e.cost ?? 0), 0))}`,
    '',
    'Tasks — what each took while it was the task in hand (approval and rating come from idle-tasks)',
    ...tasks.map((t) => `  ${t.task}: ${money(t.cost)}, ${t.turns} turns, ${share(t.cached, t.input)} of input cached, ${t.sessions.length} sessions, ${t.attempts} attempts, ${t.submits} submits, ${t.versions.length} harness versions`),
    `  unattributed: ${money(unattributed.cost)}, ${unattributed.turns} turns in ${unattributed.sessions.length} sessions`,
    '',
    'Control loops — every version of a tool a session built',
    ...(loops.length ? loops.map((l) => `  ${l.tool} from ${l.session}: ${l.lines || '?'} lines, ${money(l.buildCost)} to build, used ${l.uses}×${l.uses ? ` (answers ${Math.round(l.answerChars / l.uses)} characters, ${l.problems} reporting a problem)` : ''}${l.tasks.length ? `, for ${l.tasks.join(', ')}` : ''}`) : ['  none']),
    '',
    'Harness versions',
    ...versions.map((v) => `  ${v.version}: ${v.turns} turns, ${money(v.cost)}`),
  ].join('\n');
}
