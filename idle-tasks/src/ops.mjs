// Operations — as few as possible: task and decision each create-or-update,
// show and list read. Defined once; the CLI, the MCP server and the help text
// are all generated from this list. run(s, input, ctx) → a plain object or a string.
// ctx: { by, project }. A Refused error is an expected "no", not a crash.

import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { checksFor, config, home, mode, withStore } from './store.mjs';
import { CAPS } from './schema.mjs';
import { brief, state, tree } from './views.mjs';
import { workdir } from './context.mjs';

export class Refused extends Error {}
const refuse = (message) => { throw new Refused(message); };

const ALPHABET = 'abcdefghjkmnpqrstvwxyz23456789';
// Random, never counters: sequential ids collide as soon as two machines create at once.
const id = (prefix) => `${prefix}-${[...randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;

async function load(s, taskId) {
  return (await s.tasks([taskId]))[0] ?? refuse(`no task ${taskId}`);
}

// The caps, refused here so every store keeps them; Postgres also holds them as CHECK constraints.
const CAPPED = { title: CAPS.title, goal: CAPS.goal, acceptance_criteria: CAPS.acceptance, consumer_scenario: CAPS.scenario, plan: CAPS.plan, interview: CAPS.interview, statement: CAPS.statement, rationale: CAPS.rationale };
function capped(fields) {
  for (const [field, value] of Object.entries(fields)) {
    if (!Object.hasOwn(CAPPED, field) || typeof value !== 'string') continue;
    if (field === 'title' || field === 'statement') { if (!value) refuse(`--${field} cannot be empty`); }
    if (value.length > CAPPED[field]) refuse(`${field} too long: ${value.length} characters, the cap is ${CAPPED[field]}`);
  }
  return fields;
}

const glance = (rows) => rows.map(({ id, title, status }) => ({ id, title, status }));

// feedback (worker → planner) and verdict (why it came back) are fields that grow by one capped line.
async function append(s, task, field, body, by) {
  while (body.startsWith(`${by}:`) || body.startsWith(`- ${by}:`)) body = body.slice(body.indexOf(':') + 1).trimStart();
  if (!body) refuse('nothing to append');
  if (body.length > CAPS.entry) refuse(`too long: ${body.length} characters, the cap is ${CAPS.entry}`);
  await s.append(task, field, `- ${by}: ${body}\n`);
}

const trim = (s) => s.replace(/\/+$/, '');
export function overlaps(a, b) {
  const [x, y] = [trim(a), trim(b)];
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

// Nothing left to wait for → move on. No checks configured: straight to verified.
// Verified with review off: done.
async function settle(s, taskId) {
  let task = await load(s, taskId);
  if (task.status === 'submitted' && checksFor(task.project).length === 0) {
    await s.update(taskId, { status: 'verified' });
    task = await load(s, taskId);
  }
  if (task.status === 'verified' && !config().review) await s.update(taskId, { status: 'done' });
  return load(s, taskId);
}

function lease(input) {
  const minutes = Number(input.ttl ?? 30);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : refuse(`--ttl must be a number of minutes, not "${input.ttl}"`);
}

async function claim(s, task, input, ctx) {
  const ready = (await s.ready({ root: task.root })).some((t) => t.id === task.id);
  if (!ready) {
    const waiting = (await s.tasks(task.needs)).filter((n) => n.status !== 'done');
    const [child] = await s.children(task.id);
    const why = waiting.length ? `it needs ${waiting.map((w) => w.id).join(', ')} done first`
      : child ? 'it has children — claim one of them'
        : task.status === 'claimed' ? `it is claimed by ${task.claimed_by}` : `it is ${task.status}`;
    refuse(`${task.id} is not ready: ${why}`);
  }
  const others = (await s.liveClaims(task.root)).filter((other) => other.id !== task.id);
  for (const other of others) {
    const clash = task.scope.find((a) => other.scope.some((b) => overlaps(a, b)));
    if (clash) refuse(`scope "${clash}" overlaps ${other.id}, claimed by ${other.claimed_by}`);
  }
  await s.lease(task.id, ctx.by, lease(input));
}

// The lifecycle. Every status change goes through here; anything not listed is refused.
async function move(s, task, to, input, ctx) {
  const from = task.status;
  const mine = from === 'claimed' && task.claimed_by === ctx.by;
  // Asked of the store, not this machine's clock: on a shared database they differ.
  const live = (await s.liveClaims(task.root)).some((c) => c.id === task.id);
  const why = (field, what) => input[field] || refuse(`${from} → ${to} needs --${field}: ${what}`);
  const FREE = { claimed_by: null, claim_expires: null };

  if (to === 'claimed') {
    // An expired lease is nobody's: renewing it is a new claim, scope check and all.
    if (mine && live) return s.lease(task.id, ctx.by, lease(input));
    return claim(s, task, input, ctx);
  }
  if (to === 'archived') {
    // A task is archived with everything under it — never while the system is verifying any of it.
    const rows = await s.treeRows(task.root);
    const down = [task];
    for (let i = 0; i < down.length; i++) down.push(...rows.filter((t) => t.parent === down[i].id));
    const busy = down.find((t) => t.status === 'submitted');
    if (busy) refuse(`${busy.id} is being verified — submit it again if its checks never finished`);
    for (const t of down) await s.update(t.id, { status: 'archived' });
    return null;
  }
  switch (`${from} → ${to}`) {
    case 'proposed → open':
    case 'blocked → open':
      return s.update(task.id, { status: 'open' });
    case 'claimed → open':
      // A stray holder never comes back to release: anyone may take a live claim back, saying why.
      if (live && !mine) why('verdict', `say why you are taking it from ${task.claimed_by}`);
      return s.update(task.id, { status: 'open', ...FREE });
    case 'open → blocked':
    case 'claimed → blocked':
      if (live && !mine) refuse(`${task.id} is claimed by ${task.claimed_by}`);
      why('feedback', 'say why you are stopping');
      return s.update(task.id, { status: 'blocked', ...FREE });
    case 'claimed → submitted':
      if (!mine) refuse(`${task.id} is not claimed by ${ctx.by}`);
      return s.update(task.id, { status: 'submitted', claim_expires: null });
    case 'submitted → submitted': // checks never finished; run them again
      return null;
    case 'verified → done':
      if (config().review && task.claimed_by === ctx.by) refuse('whoever did the work cannot pass its review');
      return s.update(task.id, { status: 'done' });
    case 'open → done': {
      const children = await s.children(task.id);
      if (!children.length) refuse(`${task.id} has no children — it is finished by submitting it`);
      if (children.some((c) => !['done', 'archived'].includes(c.status))) refuse(`${task.id} still has unfinished children`);
      return s.update(task.id, { status: 'done' });
    }
    case 'verified → open':
    case 'done → open':
      why('verdict', 'say why it is not done');
      return s.update(task.id, { status: 'open', ...FREE });
    default:
      return refuse(`cannot move ${task.id} from ${from} to ${to}`);
  }
}

const FIELDS = { title: 'title', goal: 'goal', ac: 'acceptance_criteria', plan: 'plan', interview: 'interview', scenario: 'consumer_scenario', scope: 'scope', needs: 'needs', meta: 'metadata' };

async function createTask(s, input, ctx) {
  if (!input.title) refuse('a new task needs --title (or pass --id to update one)');
  const status = input.status ?? 'open';
  if (!['open', 'proposed'].includes(status)) refuse('a new task starts as open or proposed');
  capped({ title: input.title });
  const parent = input.parent ? await load(s, input.parent) : null;
  if (parent?.status === 'archived') refuse(`${parent.id} is archived`);
  if (!input.confirm) {
    const similar = await s.similarTasks({ title: input.title, root: parent?.root ?? null, project: ctx.project });
    if (similar.length) return { created: false, similar, hint: 'repeat with --confirm to create anyway' };
  }
  for (const needs of input.needs ?? []) await load(s, needs);
  const taskId = id('T');
  await s.insertTask({ id: taskId, project: parent?.project ?? ctx.project, parent: parent?.id ?? null, root: parent?.root ?? taskId, title: input.title, status });
  return taskId;
}

export const OPS = [
  {
    name: 'task',
    summary: 'Create or update a task. A title is enough — drop it now, structure it later. No --id: create (searches first, returns similar live tasks instead unless --confirm). With --id: change fields, move it with --status, add --feedback or --verdict.',
    flags: {
      id: { type: 'string', desc: 'the task to update; omit to create' },
      title: { type: 'string' },
      goal: { type: 'string', desc: 'what is true when this is done, and why it matters — the contract' },
      ac: { type: 'string', desc: 'acceptance criteria: signs the goal is reached, never a substitute for it' },
      parent: { type: 'string', desc: 'parent task id, on create; omit to drop a new root task' },
      status: { type: 'string', desc: 'proposed | open | claimed | submitted | verified | done | blocked | archived (verified is set only by the system). A new task is open; create it as proposed when it is work you found rather than were given, for someone else to accept (open) or decline (archived). claimed = claim or renew your lease; submitted = you say the goal is reached: the system then runs the project\'s configured checks (show --brief lists them) and moves the task on, or back to open with the output; open = release, accept, unblock, fail a review, reopen, or take back someone else\'s claim (with --verdict)' },
      ttl: { type: 'string', desc: 'lease in minutes when claiming (default 30)' },
      feedback: { type: 'string', desc: 'append for whoever plans the tree: the goal is wrong, the approach will not work, what you learned by doing. Required when blocking' },
      verdict: { type: 'string', desc: 'append why it is not done: blocking findings, the reason for reopening. Required when moving back to open' },
      scope: { type: 'list', desc: 'path, module or system this task touches; repeatable. Overlapping scopes cannot be claimed at once' },
      needs: { type: 'list', desc: 'task id that must be done first; repeatable' },
      plan: { type: 'string', desc: 'the condensed, worker-facing plan' },
      interview: { type: 'string', desc: 'curated Q&A from the planning interview — not a transcript' },
      scenario: { type: 'string', desc: 'how the result is used from the outside' },
      meta: { type: 'json', desc: 'free-form JSON: branch, worktree, URLs — stored, never interpreted' },
      confirm: { type: 'bool', desc: 'create even when similar live tasks exist' },
    },
    run: async (s, input, ctx) => {
      let taskId = input.id;
      if (!taskId) {
        const made = await createTask(s, input, ctx);
        if (typeof made !== 'string') return made;
        taskId = made;
      }
      const fields = {};
      for (const [flag, column] of Object.entries(FIELDS)) if (input[flag] !== undefined) fields[column] = input[flag];
      capped(fields);
      await load(s, taskId);
      if (input.id) for (const needed of input.needs ?? []) await load(s, needed);
      await s.update(taskId, fields);
      for (const field of ['feedback', 'verdict']) if (input[field]) await append(s, taskId, field, input[field], ctx.by);
      if (input.id && input.status) {
        const task = await load(s, taskId);
        if (task.status !== input.status || ['claimed', 'submitted'].includes(input.status)) await move(s, task, input.status, input, ctx);
      }
      return input.status ? settle(s, taskId) : load(s, taskId);
    },
  },
  {
    name: 'decision',
    summary: 'Create or update a decision. No --id: record one (searches first, returns similar active decisions instead unless --confirm). With --id: supersede it.',
    flags: {
      id: { type: 'string', desc: 'the decision to update; omit to create' },
      statement: { type: 'string', desc: 'one line' },
      rationale: { type: 'string' },
      task: { type: 'string', desc: 'where it was made, on create' },
      bind: { type: 'list', desc: 'task id bound by this decision; repeatable (the task it was made on always is)' },
      'superseded-by': { type: 'string', desc: 'the decision that replaces this one' },
      confirm: { type: 'bool', desc: 'record even when similar active decisions exist' },
    },
    run: async (s, input, ctx) => {
      const get = async (decisionId) => (await s.decisions([decisionId]))[0] ?? refuse(`no decision ${decisionId}`);
      let decisionId = input.id;
      if (!decisionId) {
        if (!input.task || !input.statement) refuse('a new decision needs --task and --statement');
        capped({ statement: input.statement, rationale: input.rationale });
        const task = await load(s, input.task);
        if (!input.confirm) {
          const similar = await s.similarDecisions(task.root, input.statement);
          if (similar.length) return { created: false, similar, hint: 'repeat with --confirm to record anyway' };
        }
        decisionId = id('D');
        await s.insertDecision({ id: decisionId, project: task.project, root: task.root, task: task.id, statement: input.statement, rationale: input.rationale ?? null, by: ctx.by });
        input.bind = [task.id, ...(input.bind ?? [])];
      }
      await get(decisionId);
      for (const bound of new Set(input.bind ?? [])) {
        const refs = (await load(s, bound)).decision_refs;
        if (!refs.includes(decisionId)) await s.update(bound, { decision_refs: [...refs, decisionId] });
      }
      if (input['superseded-by']) {
        await get(input['superseded-by']);
        await s.updateDecision(decisionId, { status: 'superseded', superseded_by: input['superseded-by'] });
      }
      return get(decisionId);
    },
  },
  {
    name: 'show',
    summary: 'One task or one decision. --brief: what a worker starts from. --state: the whole tree it belongs to, for whoever plans it and for the human.',
    args: ['id'],
    flags: {
      brief: { type: 'bool', desc: 'the task as a brief: goal, what it is for, plan, decisions in force, why it came back' },
      state: { type: 'bool', desc: 'the tree this task belongs to: what needs attention, feedback, tree, ready, claims, recently done' },
    },
    run: async (s, { id: shown, ...input }) => {
      if (shown.startsWith('D-')) return (await s.decisions([shown]))[0] ?? refuse(`no decision ${shown}`);
      const task = await load(s, shown);
      if (input.brief) return brief(s, task);
      if (input.state) return state(s, await load(s, task.root));
      return {
        task,
        needs: glance(await s.tasks(task.needs)),
        children: glance(await s.children(shown)),
        decisions: (await s.decisions(task.decision_refs)).map(({ id: d, statement, status }) => ({ id: d, statement, status })),
      };
    },
  },
  {
    name: 'list',
    summary: 'The root tasks of this project, most recently touched first. --root: one of them as a tree. --ready: what can be claimed now. --decisions: the decisions made in a tree.',
    flags: {
      root: { type: 'string', desc: 'a root task (any task id in its tree will do)' },
      ready: { type: 'bool', desc: 'open, everything it needs is done, no children of its own' },
      decisions: { type: 'bool', desc: 'with --root: its decisions, newest first' },
      since: { type: 'string', desc: 'with --decisions: ISO time' },
      archived: { type: 'bool', desc: 'include archived roots of this project' },
      all: { type: 'bool', desc: 'every project, archived roots too' },
    },
    run: async (s, input, ctx) => {
      const root = input.root ? (await load(s, input.root)).root : null;
      if (input.decisions) {
        if (!root) refuse('--decisions needs --root');
        return (await s.decisionsInRoot(root, { since: input.since ?? null }))
          .map(({ id: d, task, statement, rationale, by, status, superseded_by, at }) => ({ id: d, task, statement, rationale, by, status, superseded_by, at }));
      }
      if (input.ready) return s.ready({ project: ctx.project, root });
      if (!root) return s.roots({ project: ctx.project, all: input.all, archived: input.archived });
      return tree(await s.treeRows(root));
    },
  },
  {
    // For the human at a shell; not one of the operations an agent is offered.
    name: 'doctor', cliOnly: true, summary: 'Which mode this machine is on, where the data lives, and whether it is reachable.',
    run: async (s, input, ctx) => ({
      mode: mode(), home: home(), project: ctx.project, checks: checksFor(ctx.project), review: !!config().review,
      tasks: s.count(),
    }),
  },
];

const CHECK_TIMEOUT_MS = Number(process.env.IDLE_CHECK_TIMEOUT_MS) || 15 * 60_000;

// The configured commands, run where the work is. → null when green, else what failed.
function runChecks(task, worktree) {
  const cwd = worktree && existsSync(worktree) ? worktree : workdir();
  for (const command of checksFor(task.project)) {
    const run = spawnSync(command, { shell: true, cwd, encoding: 'utf8', timeout: CHECK_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
    if (run.status === 0) continue;
    const tail = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n').slice(-12).join('\n').slice(-600);
    return `\`${command}\` ${run.error ? `did not run (${run.error.code ?? run.error.message})` : `exited ${run.status}`}\n${tail}`;
  }
  return null;
}

// One call = one transaction. A task left in `submitted` is then verified by the
// system itself, outside any transaction, and moved on or sent back — no agent's word.
export async function runOp(op, input, ctx) {
  const result = await withStore((s) => op.run(s, input, ctx));
  if (op.name !== 'task' || input.status !== 'submitted' || result?.status !== 'submitted') return result;
  // The worktree is usually recorded once, on the root; a task may name its own.
  const lineage = await withStore((s) => s.lineage(result.id));
  const where = lineage.reverse().find((t) => Object.hasOwn(t.metadata ?? {}, 'worktree'));
  const failed = runChecks(result, where?.metadata.worktree);
  return withStore(async (s) => {
    const task = await load(s, result.id);
    if (task.status !== 'submitted') return task;
    if (failed) {
      await append(s, task.id, 'verdict', `checks failed — ${failed}`, 'idle');
      await s.update(task.id, { status: 'open', claimed_by: null });
      return load(s, task.id);
    }
    await s.update(task.id, { status: 'verified' });
    return settle(s, task.id);
  });
}
