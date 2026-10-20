// The loop for one session. The base owns it; the harness owns what happens in a turn.

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { compact, LIMIT, measure, size, spill } from './compact.ts';
import type { Compaction, Options as Compacting, Where } from './compact.ts';
import * as harness from './harness.ts';
import { harnessDir, sessionDir, user } from './home.ts';
import { model as openrouter, refused, tooLong } from './model.ts';
import type { Context, Message, Model, Reply } from './model.ts';
import { append, claim, read, take } from './record.ts';
import type { Item } from './record.ts';
import { BARE, registry } from './tools.ts';
import type { Tool } from './tools.ts';
import { check, fresh, turn as plain } from './turn.ts';
import type { Blocks, Step } from './turn.ts';
import * as versions from './versions.ts';

// task: the idle-tasks task the session was started for, written into every entry so its cost can be counted.
export type Options = { harness: string; session: string; cwd: string; once?: boolean; task?: string; model?: Model };

const now = () => new Date().toISOString();

// Set while a turn is running: writes that turn down as stopped, so the session goes on from there next time
// instead of running the same calls again.
let stopping: ((why: string) => void) | null = null;
export const interrupt = (why: string) => stopping?.(why);

// The commit the work is at when a turn starts, and how many files differ from it, when the work is a git repository.
// Commits are the snapshots a piece of work can be run again from; the record only has to remember them.
function work(cwd: string): { commit: string; dirty: number } | undefined {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const git = (...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8', env });
  const head = git('rev-parse', 'HEAD');
  if (head.status !== 0) return undefined;
  return { commit: head.stdout.trim(), dirty: git('status', '--porcelain').stdout.split('\n').filter(Boolean).length };
}

type Compactor = (context: Context, options: Compacting, trigger: Where['trigger'], by: string) => Promise<{ context: Context; entry: Compaction }>;

// The building blocks for one turn. Every call is written down, so a turn can later be replayed from its record.
// `ran` is shared with the plain turn that takes over from a broken one, so no tool call runs twice.
function blocks(o: Options, cwd: string, version: string, tools: Tool[], ran: Map<string, string>, calls: any[], compactor: Compactor): Blocks {
  const base: Blocks = {
    name: o.harness,
    harness: harnessDir(o.harness),
    version,
    cwd,
    session: o.session,
    tools: tools.map((t) => t.spec),
    async tool(given) {
      // A turn may build a call itself, in whatever shape it guessed. The record keeps the one shape the model uses.
      const fn: any = (given as any)?.function ?? given;
      const args = typeof fn?.arguments === 'string' ? fn.arguments : JSON.stringify(fn?.arguments ?? {});
      const call = { id: given?.id ?? `base-${ran.size + 1}`, type: 'function' as const, function: { name: String(fn?.name ?? ''), arguments: args } };
      if (!ran.has(call.id)) {
        let result: unknown;
        try {
          const found = tools.find((t) => t.spec.function.name === call.function.name);
          result = found ? await found.run(JSON.parse(call.function.arguments || '{}'), base) : `error: there is no tool named ${call.function.name || '(none given)'}`;
        } catch (error: any) {
          result = `error: ${error?.message ?? error}`; // a tool that throws says so in its result, never into the turn
        }
        ran.set(call.id, spill(sessionDir(o.harness, o.session), call.id, typeof result === 'string' ? result : JSON.stringify(result)));
        calls.push({ block: 'tool', call, result: ran.get(call.id) });
      }
      return ran.get(call.id)!;
    },
    async model(context, prompt) {
      const reply = await (o.model ?? openrouter)(context, prompt);
      calls.push({ block: 'model', context, prompt, response: reply.message, usage: reply.usage, cost: reply.cost });
      return reply.message;
    },
    turn: (context, response, arrived) => plain(context, response, arrived, base),
    compact: async (context, options = {}) => (await compactor(context, options, 'turn', `turn@${version}`)).context,
    versions: { list: () => versions.list(base.harness), show: (v) => versions.show(base.harness, v), restore: (v) => versions.restore(base.harness, v) },
  };
  return base;
}

export async function run(o: Options) {
  const record = sessionDir(o.harness, o.session);
  versions.init(harnessDir(o.harness));
  mkdirSync(record, { recursive: true });
  const release = claim(record);
  try {
    return await loop(o, record);
  } finally {
    stopping = null;
    release();
  }
}

// Returns the last entry of the record, once a session run with `once` comes to rest.
async function loop(o: Options, record: string) {
  const dir = harnessDir(o.harness);
  // A session picks up where its record ends.
  const earlier = read(record);
  let last = earlier.at(-1);
  const cwd: string = last?.cwd ?? o.cwd;
  const task: string | undefined = o.task ?? last?.task;
  let context: Context = last?.context ?? fresh(dir, cwd);
  let response: Message | null = last?.response ?? null;
  const told = new Set<string>(); // the agent hears of each problem once per version, not at every turn
  // What the provider last read, so the size of the next request is counted rather than guessed.
  let seen = last?.usage?.prompt_tokens ? { tokens: Number(last.usage.prompt_tokens), messages: last.context.messages } : undefined;
  // The base's own compactions so far, so it can stop when they come too often or achieve too little.
  const compactions = earlier.flatMap((e) => (e.calls ?? []).filter((c: any) => c?.block === 'compact').map((c: any) => ({ n: e.n, by: c.by, reclaimed: c.before - c.after })));
  let guarded = false;

  for (let n = (last?.n ?? -1) + 1; ; n++) {
    // With no answer to hand to the turn, there is nothing to do until something arrives.
    const { items, done } = await take(record, !response && !o.once);
    if (!response && !items.length) return last; // idle, and asked to run only until then

    const arrived: Item[] = [...items];
    const tell = (key: string, text: string) => {
      if (told.has(key)) return;
      told.add(key);
      arrived.push({ from: 'base', at: now(), text });
    };
    let version: string;
    try {
      version = versions.save(dir, `${o.session} turn ${n}`);
    } catch (error: any) {
      version = `unsaved-${Date.now()}`; // still a new name, so changed files load again
      tell(`save ${error.message}`, `Saving a version of your folder failed, so this turn runs it unsaved: ${error.message}`);
    }
    const own = await harness.tools(dir, version);
    for (const problem of own.problems) tell(`${version} ${problem}`, `A tool of yours was left out: ${problem}`);

    const snapshot = work(cwd);
    const ran = new Map<string, string>();
    const calls: any[] = [];
    const modelFor = (c: Context) => c.model || harness.settings(dir).model || process.env.IDLE_HARNESS_MODEL || user().harness?.model || '';
    const compactor: Compactor = async (c, options, trigger, by) => {
      const done = await compact({ ...c, model: modelFor(c) }, options, { model: o.model ?? openrouter, dir: record, n, ordinal: compactions.length + 1, by, trigger, calls, arrived });
      calls.push(done.entry);
      compactions.push({ n, by, reclaimed: done.entry.before - done.entry.after });
      return { context: { ...done.context, model: c.model }, entry: done.entry };
    };
    const base = blocks(o, cwd, version, registry(own.tools), ran, calls, compactor);
    // The plain turn that takes over uses only the base's own tools, so a broken tool cannot block it.
    const takeOver = () => plain(context, response, arrived, blocks(o, cwd, version, BARE, ran, calls, compactor));
    let phase: 'turn' | 'model' = 'turn';
    let sent: Context | undefined;
    stopping = (why) => {
      // Stopped while its tools ran: the calls that did not finish are answered as stopped.
      const results: Message[] = (response?.tool_calls ?? []).map((call) => ({ role: 'tool', tool_call_id: call.id, content: ran.get(call.id) ?? `stopped (${why}) before it finished` }));
      const at = phase === 'model' ? sent! : { ...context, messages: [...context.messages, ...(response ? [response] : []), ...results] };
      append(record, { n, at: now(), harness: o.harness, session: o.session, ...(task ? { task } : {}), agent: 'main', cwd, ...(snapshot ? { work: snapshot } : {}), version, arrived: phase === 'model' ? arrived : [], calls, stopped: why, context: at, response: null }, context);
      if (phase === 'model') done(); // what arrived is in the context; otherwise it comes again next time
    };

    let step: Step;
    let threw: string | undefined;
    const mine = await harness.turn(dir, version).catch((error) => { threw = String(error?.stack ?? error); return null; });
    try {
      if (threw) throw new Error(threw);
      // The turn gets copies: whatever it does to them, the plain turn that may take over starts from the originals.
      const copy = structuredClone({ context, response, arrived });
      step = mine ? check(await mine(copy.context, copy.response, copy.arrived, base)) : await plain(context, response, arrived, base);
    } catch (error: any) {
      threw ??= String(error?.stack ?? error);
      tell(`${version} turn`, `Your turn threw, so the plain turn ran instead:\n${threw}`);
      step = await takeOver();
    }

    let reply: Reply | undefined;
    let failed: string | undefined;
    let model = '';
    // Past its limit, the context is compacted the base's way, unless compactions came too often or did too little.
    const auto = async (c: Context, limit: number): Promise<Context> => {
      const passes = compactions.filter((pass) => pass.by === 'base');
      const thrashing = (passes.length && n - passes.at(-1)!.n <= 3) || (passes.length >= 2 && passes.slice(-2).every((pass) => pass.reclaimed < limit / 10));
      if (guarded || !thrashing) return guarded ? c : (await compactor(c, { limit }, 'limit', 'base')).context;
      guarded = true;
      return { ...c, messages: [...c.messages, { role: 'user', content: `[base] Your context passed its limit of ${limit} tokens again soon after the last compaction, or compacting achieved too little, so the base stops compacting on its own for this session. Your turn can compact with base.compact.` }] };
    };
    const ask = async (s: Step) => {
      // The turn's choice, then the harness's own, then the user's: from the environment before ~/.idle/config.json.
      model = modelFor(s.context);
      const limit = harness.settings(dir).contextLimit || Number(process.env.IDLE_HARNESS_CONTEXT) || user().harness?.contextLimit || LIMIT;
      let c: Context = { ...s.context, messages: [...s.context.messages, ...s.prompt!] };
      if (measure(c, seen) > limit) c = await auto(c, limit);
      sent = c;
      const call = async () => { reply = await (o.model ?? openrouter)({ ...c, model }, []); };
      try {
        await call();
      } catch (error) {
        // Too long for the provider: compacted to half, then a third, of what it refused, and sent again.
        let refusal = error;
        for (const share of [0.5, 0.35]) {
          if (!tooLong(refusal)) break;
          const target = Math.floor(size(c) * share);
          c = (await compactor(c, { limit: target, target }, 'overflow', 'base')).context;
          sent = c;
          try { await call(); return; } catch (again) { refusal = again; }
        }
        throw refusal;
      }
    };
    sent = { ...step.context, messages: [...step.context.messages, ...(step.prompt ?? [])] };
    if (step.prompt) {
      phase = 'model';
      try {
        await ask(step);
      } catch (error: any) {
        if (mine && !threw && refused(error)) {
          // The provider turned down what the harness's turn built. The plain turn builds it again from the originals.
          tell(`${version} refused`, `The model provider refused the request your turn built, so the plain turn ran instead: ${error.message}`);
          step = await takeOver();
          try { await ask(step); } catch (again: any) { failed = String(again?.message ?? again); }
        } else {
          failed = String(error?.message ?? error);
        }
      }
    }

    const costs = [reply?.cost, ...calls.map((call) => call.cost)].filter((cost): cost is number => typeof cost === 'number');
    last = {
      n, at: now(), harness: o.harness, session: o.session, ...(task ? { task } : {}), agent: 'main', cwd, ...(snapshot ? { work: snapshot } : {}), version, model, arrived, calls, threw,
      context: sent, response: reply?.message ?? null, usage: reply?.usage, cost: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : null, failed,
    };
    append(record, last, context);
    stopping = null;
    done();
    context = sent;
    response = reply?.message ?? null;
    seen = reply?.usage?.prompt_tokens ? { tokens: Number(reply.usage.prompt_tokens), messages: sent.messages } : undefined;
  }
}
