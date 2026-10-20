// The plain front end and the human's commands. A front end only writes to a session's inbox and follows its record.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { constants } from 'node:os';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { report } from './analytics.ts';
import { harnessDir, sessionDir } from './home.ts';
import { interrupt, run } from './loop.ts';
import { follower, holder, pending, send } from './record.ts';
import type { Review } from './record.ts';
import * as versions from './versions.ts';

const USAGE = `idle-harness chat <harness> [message] [--session <id>] [--task <id>] [--once]
                                             talk to a harness; --once answers and exits,
                                             --task names the idle-tasks task the session works on
idle-harness stats <harness> [--json]        what its tasks took, and what its own tools cost and did

In a chat, the human reviews a piece of work: /approve [1-5] [note], /rate <1-5> [note] later, /reject <reason>.
idle-harness versions <harness>              the versions of its folder
idle-harness restore <harness> <version>     put its folder back at a version

A harness is a folder under ~/.idle/harness/ and is created the first time you talk to it.
When the input ends, the harness finishes what it was asked and the command exits.
Needs an OpenRouter key and a model, in ~/.idle/config.json: { "openrouter": { "apiKey": "…" }, "harness": { "model": "…" } }.
OPENROUTER_API_KEY and IDLE_HARNESS_MODEL override them; "model" in a harness's own config.json overrides the default model.`;

const SIGNALS = [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]] as const;
const [command, name, ...rest] = process.argv.slice(2);

function flag(wanted: string, takesValue: boolean): string | undefined {
  const at = rest.indexOf(wanted);
  if (at < 0) return undefined;
  return takesValue ? rest.splice(at, 2)[1] : rest.splice(at, 1)[0];
}

// Progress goes to stderr and answers to stdout, so `--once` can be piped. A record can hold whatever a harness
// put into it, so nothing here may assume its shape.
function show(entry: any) {
  if (entry.threw) process.stderr.write(`! the harness's turn threw, the plain turn ran: ${String(entry.threw).split('\n')[0]}\n`);
  for (const call of entry.calls ?? []) {
    const fn = call?.call?.function ?? call?.call;
    if (call?.block === 'tool') process.stderr.write(`· ${fn?.name ?? '?'} ${String(typeof fn?.arguments === 'string' ? fn.arguments : JSON.stringify(fn?.arguments ?? '')).slice(0, 120)}\n`);
  }
  if (entry.response?.content) process.stdout.write(`${entry.response.content}\n`);
  if (entry.failed) process.stderr.write(`! ${entry.failed}\n`);
  if (entry.stopped) process.stderr.write(`! stopped (${entry.stopped})\n`);
}

// The human's answer to a piece of work, for the agent to read and the record to keep. Anything else is a message.
function review(line: string, task?: string): { text: string; review: Review } | string | null {
  const said = line.trim().match(/^\/(approve|rate|reject)(?:\s+([\s\S]*))?$/);
  if (!said) return null;
  const verdict = ({ approve: 'approved', rate: 'rated', reject: 'rejected' } as const)[said[1] as 'approve' | 'rate' | 'reject'];
  const scored = verdict === 'rejected' ? null : (said[2] ?? '').match(/^([1-5])(?:\s+([\s\S]*))?$/);
  const rating = scored ? Number(scored[1]) : undefined;
  const note = ((scored ? scored[2] : said[2]) ?? '').trim();
  if (verdict === 'rated' && !rating) return 'rate with a number from 1 to 5: /rate 4 the tests read well';
  if (verdict === 'rejected' && !note) return 'say why: /reject the totals are still off for refunds';
  const text = verdict === 'approved' ? `The human approved the work${rating ? ` and rated it ${rating} of 5` : ''}${note ? `: ${note}` : '.'}`
    : verdict === 'rated' ? `The human rated the work ${rating} of 5${note ? `: ${note}` : '.'}`
    : `The human rejected the work: ${note}`;
  return { text, review: { verdict, ...(rating ? { rating } : {}), note, ...(task ? { task } : {}) } };
}

function chat() {
  const once = Boolean(flag('--once', false));
  const task = flag('--task', true);
  const session = flag('--session', true) ?? `${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}-${Math.random().toString(36).slice(2, 6)}`;
  const dir = sessionDir(name, session);
  mkdirSync(dir, { recursive: true });
  // A session that is already running is talked to, not started a second time.
  const running = holder(dir);
  if (running && once) throw new Error(`session ${session} is already running; talk to it without --once`);

  const news = follower(dir, true);
  let turns = 0;
  let cost = 0;
  let latest: any;
  const follow = () => news().forEach((entry) => { show(entry); turns++; cost += entry.cost ?? 0; latest = entry; });
  // A review goes in as the human's verdict, everything else as what they said. A review that cannot be read is not sent.
  const deliver = (line: string) => {
    const verdict = review(line, task);
    if (typeof verdict === 'string') process.stderr.write(`! ${verdict}\n`);
    else if (verdict) send(dir, 'review', verdict.text, verdict.review);
    else send(dir, 'user', line);
    return typeof verdict !== 'string';
  };
  if (rest.length && !deliver(rest.join(' '))) process.exit(2);
  // The session is its own process: stopping it stops nothing else, and its record lets it be picked up again.
  const bin = fileURLToPath(new URL('../bin/idle-harness.mjs', import.meta.url));
  const child = running ? undefined : spawn(process.execPath, [bin, 'run', name, session, ...(once ? ['--once'] : []), ...(task ? ['--task', task] : [])], { stdio: ['ignore', 'inherit', 'inherit'] });
  process.on('exit', () => child?.kill()); // however this front end ends, the session it started ends with it
  let ended = false; // the end of the input is a normal way to leave
  const timer = setInterval(() => {
    follow();
    // Once the input has ended, the session finishes what it was asked and is stopped when it has nothing left to do.
    if (ended && child && !pending(dir) && latest?.response === null) child.kill();
  }, 150);
  const leave = (code: number) => {
    clearInterval(timer);
    follow();
    process.stderr.write(`session ${session} · ${turns} turns · $${cost.toFixed(4)}\n`);
    process.exit(code);
  };
  const input = once ? undefined : createInterface({ input: process.stdin });
  let asked = rest.length > 0;
  input?.on('line', (line) => { if (line.trim() && deliver(line)) asked = true; });
  input?.on('close', () => { ended = true; if (!child) leave(0); else if (!asked) child.kill(); });
  // Leaving a session this front end did not start leaves it running.
  for (const [signal] of SIGNALS) process.on(signal, () => (child ? child.kill(signal) : leave(0)));
  child?.on('exit', (code, signal) => leave(ended ? 0 : code ?? 128 + (signal ? constants.signals[signal] : 0)));
}

try {
  if (!command || !name || !/^[\w-]+$/.test(name)) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(command ? 2 : 0);
  }
  if (command === 'chat') chat();
  else if (command === 'run') {
    // The session's own process. Stopped in the middle of a turn, it writes that turn down as stopped;
    // on its way out it stops the commands it started.
    for (const [signal, code] of SIGNALS) process.on(signal, () => { interrupt(signal); process.exit(code); });
    const task = rest.includes('--task') ? rest[rest.indexOf('--task') + 1] : undefined;
    const last = await run({ harness: name, session: rest[0], cwd: process.cwd(), once: rest.includes('--once'), task });
    // Its work done, the session ends, even when something a turn or a tool started — a server, a timer — is still open.
    process.exit(last?.failed ? 1 : 0);
  } else if (!existsSync(harnessDir(name))) throw new Error(`there is no harness named ${name}`);
  else if (command === 'versions') process.stdout.write(`${versions.list(harnessDir(name))}\n`);
  else if (command === 'stats') process.stdout.write(`${report(name, rest.includes('--json'))}\n`);
  else if (command === 'restore') process.stdout.write(`${name} is back at ${rest[0]}; that is now version ${versions.restore(harnessDir(name), rest[0])}\n`);
  else throw new Error(`there is no command named ${command}\n\n${USAGE}`);
} catch (error: any) {
  process.stderr.write(`idle-harness: ${error.message}\n`);
  process.exit(2);
}
