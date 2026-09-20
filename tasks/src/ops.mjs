// Operations — as few as possible: task and decision each create-or-update,
// show and list read. Defined once; the CLI, the MCP server and the help text
// are all generated from this list. run(q, input, ctx) → a plain object or a string.
// ctx: { by, project }. A Refused error is an expected "no", not a crash.

import { randomBytes } from 'node:crypto';
import { config, home, mode } from './store.mjs';
import { CAPS, version } from './schema.mjs';
import { brief, state, tree } from './views.mjs';

export class Refused extends Error {}
const refuse = (message) => { throw new Refused(message); };

const ALPHABET = 'abcdefghjkmnpqrstvwxyz23456789';
// Random, never counters: sequential ids collide as soon as two machines create at once.
const id = (prefix) => `${prefix}-${[...randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;

const LIVE = `status = 'claimed' and claim_expires > now()`;
const READY = `
  (t.status = 'open' or (t.status = 'claimed' and t.claim_expires <= now()))
  and not exists (select 1 from tasks n where n.id = any(t.needs) and n.status <> 'done')
  and not exists (select 1 from tasks c where c.parent = t.id)`;

async function load(q, taskId) {
  const [task] = await q(`select * from tasks where id = $1`, [taskId]);
  return task ?? refuse(`no task ${taskId}`);
}

// feedback (worker → arbiter) and verdict (why it came back) are fields that grow by one capped line.
async function append(q, task, field, body, by) {
  if (body.length > CAPS.entry) refuse(`too long: ${body.length} characters, the cap is ${CAPS.entry}`);
  await q(`update tasks set ${field} = ${field} || $2, updated_at = now() where id = $1`, [task, `- ${by}: ${body}\n`]);
}

async function setStatus(q, taskId, status, extra = '') {
  await q(`update tasks set status = $2, updated_at = now() ${extra} where id = $1`, [taskId, status]);
}

const trim = (s) => s.replace(/\/+$/, '');
export function overlaps(a, b) {
  const [x, y] = [trim(a), trim(b)];
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

// Nothing left to wait for → move on. No checks: straight to verified.
// Verified with review off: done.
async function settle(q, taskId) {
  let task = await load(q, taskId);
  if (task.status === 'submitted' && task.checks.length === 0) {
    await setStatus(q, taskId, 'verified');
    task = await load(q, taskId);
  }
  if (task.status === 'verified' && !config().review) await setStatus(q, taskId, 'done');
  return load(q, taskId);
}

async function similarTasks(q, title, root, project) {
  return q(
    `select id, title, status from tasks
     where status not in ('done', 'archived')
       and (($2::text is not null and root = $2) or ($2::text is null and project = $3 and parent is null))
       and (similarity(title, $1) > 0.45
            or to_tsvector('english', title || ' ' || goal) @@ plainto_tsquery('english', $1))
     order by similarity(title, $1) desc limit 5`,
    [title, root, project],
  );
}

const lease = (input) => Number(input.ttl ?? 30);

async function claim(q, task, input, ctx) {
  // Serialises claims within a stream, on any Postgres.
  await q(`select pg_advisory_xact_lock(hashtext($1))`, [task.root]);
  const [ready] = await q(`select t.id from tasks t where t.id = $1 and ${READY}`, [task.id]);
  if (!ready) refuse(`${task.id} is not ready (status ${task.status})`);
  const others = await q(`select id, scope, claimed_by from tasks where root = $1 and id <> $2 and ${LIVE}`, [task.root, task.id]);
  for (const other of others) {
    const clash = task.scope.find((a) => other.scope.some((b) => overlaps(a, b)));
    if (clash) refuse(`scope "${clash}" overlaps ${other.id}, claimed by ${other.claimed_by}`);
  }
  await q(`update tasks set status = 'claimed', claimed_by = $2, claim_expires = now() + make_interval(mins => $3), updated_at = now() where id = $1`,
    [task.id, ctx.by, lease(input)]);
}

// The lifecycle. Every status change goes through here; anything not listed is refused.
async function move(q, task, to, input, ctx) {
  const from = task.status;
  const mine = from === 'claimed' && task.claimed_by === ctx.by;
  const why = (field, what) => input[field] || refuse(`${from} → ${to} needs --${field}: ${what}`);
  const FREE = ', claimed_by = null, claim_expires = null';

  if (to === 'claimed') {
    if (mine) return q(`update tasks set claim_expires = now() + make_interval(mins => $2) where id = $1`, [task.id, lease(input)]);
    return claim(q, task, input, ctx);
  }
  if (to === 'archived') {
    // A stream is archived with everything under it.
    return q(`update tasks set status = 'archived', updated_at = now() where id = $1 or (root = $1 and $2)`, [task.id, task.parent === null]);
  }
  switch (`${from} → ${to}`) {
    case 'proposed → open':
    case 'blocked → open':
      return setStatus(q, task.id, 'open');
    case 'claimed → open':
      if (!mine) refuse(`${task.id} is not claimed by ${ctx.by}`);
      return setStatus(q, task.id, 'open', FREE);
    case 'open → blocked':
    case 'claimed → blocked':
      why('feedback', 'say why you are stopping');
      return setStatus(q, task.id, 'blocked', FREE);
    case 'claimed → submitted':
      if (!mine) refuse(`${task.id} is not claimed by ${ctx.by}`);
      return setStatus(q, task.id, 'submitted', ', claim_expires = null');
    case 'submitted → verified':
      return setStatus(q, task.id, 'verified');
    case 'verified → done':
      if (config().review && task.claimed_by === ctx.by) refuse('whoever did the work cannot pass its review');
      return setStatus(q, task.id, 'done');
    case 'open → done': {
      const children = await q(`select status from tasks where parent = $1`, [task.id]);
      if (!children.length) refuse(`${task.id} has no children — it is finished by submitting it`);
      if (children.some((c) => !['done', 'archived'].includes(c.status))) refuse(`${task.id} still has unfinished children`);
      return setStatus(q, task.id, 'done');
    }
    case 'submitted → open':
    case 'verified → open':
    case 'done → open':
      why('verdict', 'say why it is not done');
      return setStatus(q, task.id, 'open', FREE);
    default:
      return refuse(`cannot move ${task.id} from ${from} to ${to}`);
  }
}

const FIELDS = { title: 'title', goal: 'goal', ac: 'acceptance_criteria', plan: 'plan', interview: 'interview', scenario: 'consumer_scenario', scope: 'scope', needs: 'needs' };
const JSON_FIELDS = { check: 'checks', meta: 'metadata' };

async function createTask(q, input, ctx) {
  if (!input.title) refuse('a new task needs --title (or pass --id to update one)');
  const status = input.status ?? 'open';
  if (!['open', 'proposed'].includes(status)) refuse('a new task starts as open or proposed');
  const parent = input.parent ? await load(q, input.parent) : null;
  if (parent?.status === 'archived') refuse(`${parent.id} is archived`);
  if (!input.confirm) {
    const similar = await similarTasks(q, input.title, parent?.root ?? null, ctx.project);
    if (similar.length) return { created: false, similar, hint: 'repeat with --confirm to create anyway' };
  }
  for (const needs of input.needs ?? []) await load(q, needs);
  const taskId = id('T');
  await q(`insert into tasks(id, project, parent, root, title, status) values ($1, $2, $3, $4, $5, $6)`,
    [taskId, parent?.project ?? ctx.project, parent?.id ?? null, parent?.root ?? taskId, input.title, status]);
  return taskId;
}

export const OPS = [
  {
    name: 'task',
    summary: 'Create or update a task. No --id: create (searches first, returns similar live tasks instead unless --confirm). With --id: change fields, move it with --status, add --feedback or --verdict.',
    flags: {
      id: { type: 'string', desc: 'the task to update; omit to create' },
      title: { type: 'string' },
      goal: { type: 'string', desc: 'what is true when this is done, and why it matters — the contract' },
      ac: { type: 'string', desc: 'acceptance criteria: signs the goal is reached, never a substitute for it' },
      parent: { type: 'string', desc: 'parent task id, on create; omit to open a new stream (a root task)' },
      status: { type: 'string', desc: 'proposed | open | claimed | submitted | verified | done | blocked | archived. claimed = claim or renew your lease; open = release, accept, unblock, reject or reopen; a worker goes no further than submitted' },
      ttl: { type: 'string', desc: 'lease in minutes when claiming (default 30)' },
      feedback: { type: 'string', desc: 'append for the arbiter: the goal is wrong, the approach will not work, what you learned by doing. Required when blocking' },
      verdict: { type: 'string', desc: 'append why it is not done: a failed check, blocking findings, the reason for reopening. Required when moving back to open' },
      check: { type: 'list', desc: 'verification command; repeatable' },
      scope: { type: 'list', desc: 'path, module or system this task touches; repeatable. Overlapping scopes cannot be claimed at once' },
      needs: { type: 'list', desc: 'task id that must be done first; repeatable' },
      plan: { type: 'string', desc: 'the condensed, worker-facing plan' },
      interview: { type: 'string', desc: 'curated Q&A from the planning interview — not a transcript' },
      scenario: { type: 'string', desc: 'how the result is used from the outside' },
      meta: { type: 'json', desc: 'free-form JSON: branch, worktree, URLs — stored, never interpreted' },
      confirm: { type: 'bool', desc: 'create even when similar live tasks exist' },
    },
    run: async (q, input, ctx) => {
      let taskId = input.id;
      if (!taskId) {
        const made = await createTask(q, input, ctx);
        if (typeof made !== 'string') return made;
        taskId = made;
      }
      const sets = []; const params = [taskId];
      for (const [flag, column] of Object.entries(FIELDS)) {
        if (input[flag] !== undefined) { params.push(input[flag]); sets.push(`${column} = $${params.length}`); }
      }
      for (const [flag, column] of Object.entries(JSON_FIELDS)) {
        if (input[flag] !== undefined) { params.push(JSON.stringify(input[flag])); sets.push(`${column} = $${params.length}::jsonb`); }
      }
      await load(q, taskId);
      if (sets.length) await q(`update tasks set ${sets.join(', ')}, updated_at = now() where id = $1`, params);
      for (const field of ['feedback', 'verdict']) if (input[field]) await append(q, taskId, field, input[field], ctx.by);
      if (input.id && input.status) {
        const task = await load(q, taskId);
        if (task.status !== input.status || input.status === 'claimed') await move(q, task, input.status, input, ctx);
      }
      return settle(q, taskId);
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
    run: async (q, input, ctx) => {
      const get = async (decisionId) => (await q(`select * from decisions where id = $1`, [decisionId]))[0] ?? refuse(`no decision ${decisionId}`);
      let decisionId = input.id;
      if (!decisionId) {
        if (!input.task || !input.statement) refuse('a new decision needs --task and --statement');
        const task = await load(q, input.task);
        if (!input.confirm) {
          const similar = await q(
            `select id, statement from decisions where root = $1 and status = 'active'
             and (similarity(statement, $2) > 0.45 or to_tsvector('english', statement) @@ plainto_tsquery('english', $2)) limit 5`,
            [task.root, input.statement]);
          if (similar.length) return { created: false, similar, hint: 'repeat with --confirm to record anyway' };
        }
        decisionId = id('D');
        await q(`insert into decisions(id, project, root, task, statement, rationale, by) values ($1, $2, $3, $4, $5, $6, $7)`,
          [decisionId, task.project, task.root, task.id, input.statement, input.rationale ?? null, ctx.by]);
        input.bind = [task.id, ...(input.bind ?? [])];
      }
      await get(decisionId);
      for (const bound of new Set(input.bind ?? [])) {
        await load(q, bound);
        await q(`update tasks set decision_refs = array_append(decision_refs, $2) where id = $1 and not ($2 = any(decision_refs))`, [bound, decisionId]);
      }
      if (input['superseded-by']) {
        await get(input['superseded-by']);
        await q(`update decisions set status = 'superseded', superseded_by = $2 where id = $1`, [decisionId, input['superseded-by']]);
      }
      return get(decisionId);
    },
  },
  {
    name: 'show',
    summary: 'One task or one decision. --brief: what a worker starts from. --state: the whole stream, for the arbiter and the human.',
    args: ['id'],
    flags: {
      brief: { type: 'bool', desc: 'the task as a brief: goal, what it is for, plan, decisions in force, why it came back' },
      state: { type: 'bool', desc: 'the stream this task belongs to: what needs attention, feedback, tree, ready, claims, recently done' },
    },
    run: async (q, { id: shown, ...input }) => {
      if (shown.startsWith('D-')) return (await q(`select * from decisions where id = $1`, [shown]))[0] ?? refuse(`no decision ${shown}`);
      const task = await load(q, shown);
      if (input.brief) return brief(q, task);
      if (input.state) return state(q, await load(q, task.root));
      return {
        task,
        needs: await q(`select id, title, status from tasks where id = any($1)`, [task.needs]),
        children: await q(`select id, title, status from tasks where parent = $1 order by created_at`, [shown]),
        decisions: await q(`select id, statement, status from decisions where id = any($1)`, [task.decision_refs]),
      };
    },
  },
  {
    name: 'list',
    summary: 'The streams of this project. --root: that stream as a tree. --ready: what can be claimed now. --decisions: the decisions of a stream.',
    flags: {
      root: { type: 'string', desc: 'a stream (any task id in it will do)' },
      ready: { type: 'bool', desc: 'open, everything it needs is done, no children of its own' },
      decisions: { type: 'bool', desc: 'with --root: its decisions, newest first' },
      since: { type: 'string', desc: 'with --decisions: ISO time' },
      all: { type: 'bool', desc: 'every project, archived streams too' },
    },
    run: async (q, input, ctx) => {
      const root = input.root ? (await load(q, input.root)).root : null;
      if (input.decisions) {
        if (!root) refuse('--decisions needs --root');
        return q(`select id, task, statement, rationale, by, status, superseded_by, at from decisions
                  where root = $1 and ($2::timestamptz is null or at >= $2) order by at desc`, [root, input.since ?? null]);
      }
      if (input.ready) {
        return q(`select t.id, t.root, t.title, t.scope from tasks t
                  where ${READY} and t.project = $1 and ($2::text is null or t.root = $2) order by t.created_at`, [ctx.project, root]);
      }
      if (!root) {
        return q(`select id, project, title, status from tasks where parent is null
                  and ($1 or (project = $2 and status <> 'archived')) order by created_at`, [!!input.all, ctx.project]);
      }
      return tree(await q(`select id, parent, title, status, claimed_by from tasks where root = $1 order by created_at`, [root]));
    },
  },
  {
    // For the human at a shell; not one of the operations an agent is offered.
    name: 'doctor', cliOnly: true, summary: 'Which mode this machine is on, where the data lives, and whether it is reachable.',
    run: async (q) => ({
      mode: mode(), home: home(), schema: await version(q),
      tasks: Number((await q(`select count(*) n from tasks`))[0].n),
    }),
  },
];
