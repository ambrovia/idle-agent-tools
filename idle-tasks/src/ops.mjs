// Operations — as few as possible: task and decision each create-or-update,
// show and list read. Defined once; the CLI, the MCP server and the help text
// are all generated from this list. run(q, input, ctx) → a plain object or a string.
// ctx: { by, project }. A Refused error is an expected "no", not a crash.

import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checksFor, config, home, mode, withTx } from './store.mjs';
import { CAPS, version } from './schema.mjs';
import { brief, state, tree } from './views.mjs';
import { workdir } from './context.mjs';

export class Refused extends Error {}
const refuse = (message) => { throw new Refused(message); };

const ALPHABET = 'abcdefghjkmnpqrstvwxyz23456789';
// Random, never counters: sequential ids collide as soon as two machines create at once.
const id = (prefix) => `${prefix}-${[...randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;

// Near-duplicates only. Measured: a typo or reworded title scores 0.7–0.95, siblings that
// merely share a prefix ("Newsletter signup form" / "… API endpoint") about 0.5.
const SIMILAR = 0.65;

const LIVE = `status = 'claimed' and claim_expires > now()`;
const READY = `
  (t.status = 'open' or (t.status = 'claimed' and t.claim_expires <= now()))
  and not exists (select 1 from tasks n where n.id = any(t.needs) and n.status <> 'done')
  and not exists (select 1 from tasks c where c.parent = t.id)`;

async function load(q, taskId) {
  const [task] = await q(`select * from tasks where id = $1`, [taskId]);
  return task ?? refuse(`no task ${taskId}`);
}

// feedback, verdict, retro, and outcome are fields that grow by one capped line.
async function append(q, task, field, body, by) {
  while (body.startsWith(`${by}:`) || body.startsWith(`- ${by}:`)) body = body.slice(body.indexOf(':') + 1).trimStart();
  if (!body) refuse('nothing to append');
  if (body.length > CAPS.entry) refuse(`too long: ${body.length} characters, the cap is ${CAPS.entry}`);
  await q(`update tasks set ${field} = ${field} || $2, updated_at = now() where id = $1`, [task, `- ${by}: ${body}\n`]);
}

async function setStatus(q, taskId, status, extra = '') {
  await q(`update tasks set status = $2, updated_at = now() ${extra} where id = $1`, [taskId, status]);
}

async function bump(q, taskId, key) {
  await q(
    `update tasks set metadata = jsonb_set(metadata, array[$2], to_jsonb(coalesce((metadata->>$2)::int, 0) + 1)) where id = $1`,
    [taskId, key],
  );
}

const trim = (s) => s.replace(/(?:\/\*\*?|\/)+$/, '');
export function overlaps(a, b) {
  if (!a || !b) return false;
  const [x, y] = [trim(a), trim(b)];
  if (!x || !y || x === '*' || y === '*' || x === '**' || y === '**') return true;
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

// Nothing left to wait for → move on. No checks configured: straight to verified.
// Verified with review off: done.
async function settle(q, taskId) {
  let task = await load(q, taskId);
  if (task.status === 'submitted' && checksFor(task.project).length === 0) {
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
       and similarity(title, $1) > ${SIMILAR}
     order by similarity(title, $1) desc limit 5`,
    [title, root, project],
  );
}

function lease(input) {
  const minutes = Number(input.ttl ?? 30);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : refuse(`--ttl must be a number of minutes, not "${input.ttl}"`);
}

async function claim(q, task, input, ctx) {
  // Serialises claims within one tree, on any Postgres.
  await q(`select pg_advisory_xact_lock(hashtext($1))`, [task.root]);
  const [ready] = await q(`select t.id from tasks t where t.id = $1 and ${READY}`, [task.id]);
  if (!ready) {
    const waiting = await q(`select id from tasks where id = any($1) and status <> 'done'`, [task.needs]);
    const [child] = await q(`select id from tasks where parent = $1 limit 1`, [task.id]);
    const why = waiting.length ? `it needs ${waiting.map((w) => w.id).join(', ')} done first`
      : child ? 'it has children — claim one of them'
        : task.status === 'claimed' ? `it is claimed by ${task.claimed_by}` : `it is ${task.status}`;
    refuse(`${task.id} is not ready: ${why}`);
  }
  const others = await q(`select id, scope, claimed_by from tasks where root = $1 and id <> $2 and ${LIVE}`, [task.root, task.id]);
  for (const other of others) {
    const clash = task.scope.find((a) => other.scope.some((b) => overlaps(a, b)));
    if (clash) refuse(`scope "${clash}" overlaps ${other.id}, claimed by ${other.claimed_by}`);
  }
  await q(`update tasks set status = 'claimed', claimed_by = $2, claim_expires = now() + make_interval(secs => $3::float8 * 60), updated_at = now() where id = $1`,
    [task.id, ctx.by, lease(input)]);
}

// The lifecycle. Every status change goes through here; anything not listed is refused.
async function move(q, task, to, input, ctx) {
  const from = task.status;
  const mine = from === 'claimed' && task.claimed_by === ctx.by;
  // Asked of the database, not this machine's clock: on a shared database they differ.
  const [{ live }] = await q(`select (${LIVE}) as live from tasks where id = $1`, [task.id]);
  const why = (field, what) => input[field] || refuse(`${from} → ${to} needs --${field}: ${what}`);
  const FREE = ', claimed_by = null, claim_expires = null';

  if (to === 'claimed') {
    // An expired lease is nobody's: renewing it is a new claim, scope check and all.
    if (mine && live) return q(`update tasks set claim_expires = now() + make_interval(secs => $2::float8 * 60) where id = $1`, [task.id, lease(input)]);
    return claim(q, task, input, ctx);
  }
  if (to === 'archived') {
    // A task is archived with everything under it — never while the system is verifying any of it.
    const DOWN = `with recursive down as (select id, status from tasks where id = $1
      union all select t.id, t.status from tasks t join down on t.parent = down.id)`;
    const [busy] = await q(`${DOWN} select id from down where status = 'submitted' limit 1`, [task.id]);
    if (busy) refuse(`${busy.id} is being verified — submit it again if its checks never finished`);
    return q(`${DOWN} update tasks set status = 'archived', updated_at = now() where id in (select id from down)`, [task.id]);
  }
  switch (`${from} → ${to}`) {
    case 'proposed → open':
    case 'blocked → open':
      return setStatus(q, task.id, 'open');
    case 'claimed → open':
      // A stray holder never comes back to release: anyone may take a live claim back, saying why.
      if (live && !mine) why('verdict', `say why you are taking it from ${task.claimed_by}`);
      return setStatus(q, task.id, 'open', FREE);
    case 'open → blocked':
    case 'claimed → blocked':
      if (live && !mine) refuse(`${task.id} is claimed by ${task.claimed_by}`);
      why('feedback', 'say why you are stopping');
      return setStatus(q, task.id, 'blocked', FREE);
    case 'claimed → submitted':
      if (!mine) refuse(`${task.id} is not claimed by ${ctx.by}`);
      return setStatus(q, task.id, 'submitted', ', claim_expires = null');
    case 'submitted → submitted': // checks never finished; run them again
      return null;
    case 'verified → done':
      if (config().review && task.claimed_by === ctx.by) refuse('whoever did the work cannot pass its review');
      return setStatus(q, task.id, 'done');
    case 'open → done': {
      const children = await q(`select status from tasks where parent = $1`, [task.id]);
      if (!children.length) refuse(`${task.id} has no children — it is finished by submitting it`);
      if (children.some((c) => !['done', 'archived'].includes(c.status))) refuse(`${task.id} still has unfinished children`);
      return setStatus(q, task.id, 'done');
    }
    case 'verified → open':
      why('verdict', 'say why it is not done');
      await bump(q, task.id, 'review_bounces');
      return setStatus(q, task.id, 'open', FREE);
    case 'done → open':
      why('verdict', 'say why it is not done');
      await bump(q, task.id, 'reopens');
      return setStatus(q, task.id, 'open', FREE);
    default:
      return refuse(`cannot move ${task.id} from ${from} to ${to}`);
  }
}

const FIELDS = { title: 'title', goal: 'goal', ac: 'acceptance_criteria', plan: 'plan', interview: 'interview', scenario: 'consumer_scenario', scope: 'scope', needs: 'needs' };
const JSON_FIELDS = { meta: 'metadata' };

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
    summary: 'Create or update a task. A title is enough — drop it now, structure it later. No --id: create (searches first, returns similar live tasks instead unless --confirm). With --id: change fields, move it with --status, add --feedback, --verdict, --retro or --outcome.',
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
      retro: { type: 'string', desc: 'append a self-reflection observation (success, friction, divergence, cost) after work completes' },
      outcome: { type: 'string', desc: 'append outer feedback or real-world impact: PR review comments, user feedback, business KPIs, runtime/analytics signals' },
      scope: { type: 'list', desc: 'path, module or system this task touches; repeatable. Overlapping scopes cannot be claimed at once' },
      needs: { type: 'list', desc: 'task id that must be done first; repeatable' },
      plan: { type: 'string', desc: 'the condensed, worker-facing plan' },
      interview: { type: 'string', desc: 'the planning interview Q&A progression' },
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
      if (input.id) for (const needed of input.needs ?? []) await load(q, needed);
      if (sets.length) await q(`update tasks set ${sets.join(', ')}, updated_at = now() where id = $1`, params);
      for (const field of ['feedback', 'verdict', 'retro', 'outcome']) if (input[field]) await append(q, taskId, field, input[field], ctx.by);
      if (input.id && input.status) {
        const task = await load(q, taskId);
        if (task.status !== input.status || ['claimed', 'submitted'].includes(input.status)) await move(q, task, input.status, input, ctx);
      }
      return input.status ? settle(q, taskId) : load(q, taskId);
    },
  },
  {
    name: 'decision',
    summary: 'Create or update a decision, assumption, or project-wide memory/taste. No --id: record one (with --task on a tree, or omit --task for standing project-wide memory; searches first unless --confirm). With --id: supersede or update it.',
    flags: {
      id: { type: 'string', desc: 'the decision to update; omit to create' },
      kind: { type: 'string', desc: 'decision | assumption | taste (default decision). Use assumption for an unverified premise; taste for a standing preference or in-session steering nudge' },
      statement: { type: 'string', desc: 'one line' },
      rationale: { type: 'string' },
      task: { type: 'string', desc: 'where it was made, on create; omit to record standing project-wide memory' },
      bind: { type: 'list', desc: 'task id bound by this decision; repeatable (the task it was made on always is)' },
      'superseded-by': { type: 'string', desc: 'the decision that replaces this one' },
      confirm: { type: 'bool', desc: 'record even when similar active decisions exist' },
    },
    run: async (q, input, ctx) => {
      const get = async (decisionId) => (await q(`select * from decisions where id = $1`, [decisionId]))[0] ?? refuse(`no decision ${decisionId}`);
      let decisionId = input.id;
      if (!decisionId) {
        if (!input.statement) refuse('a new decision needs --statement');
        const kind = input.kind ?? 'decision';
        if (!['decision', 'assumption', 'taste'].includes(kind)) refuse(`--kind must be decision, assumption, or taste, not "${kind}"`);
        const task = input.task ? await load(q, input.task) : null;
        const project = task?.project ?? ctx.project;
        const root = task?.root ?? null;
        if (!input.confirm) {
          const similar = await q(
            `select id, kind, statement from decisions where project = $1 and root is not distinct from $2 and status = 'active'
             and similarity(statement, $3) > ${SIMILAR} limit 5`,
            [project, root, input.statement]);
          if (similar.length) return { created: false, similar, hint: 'repeat with --confirm to record anyway' };
        }
        decisionId = id('D');
        await q(`insert into decisions(id, project, root, task, kind, statement, rationale, by) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [decisionId, project, root, task?.id ?? null, kind, input.statement, input.rationale ?? null, ctx.by]);
        if (task) input.bind = [task.id, ...(input.bind ?? [])];
      } else if (input.kind) {
        if (!['decision', 'assumption', 'taste'].includes(input.kind)) refuse(`--kind must be decision, assumption, or taste, not "${input.kind}"`);
        await get(decisionId);
        await q(`update decisions set kind = $2 where id = $1`, [decisionId, input.kind]);
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
    summary: 'One task or one decision. --brief: what a worker starts from. --state: the whole tree it belongs to, for whoever plans it and for the human.',
    args: ['id'],
    flags: {
      brief: { type: 'bool', desc: 'the task as a brief: goal, what it is for, plan, interview, project memory, decisions & assumptions in force, why it came back' },
      state: { type: 'bool', desc: 'the tree this task belongs to: what needs attention, feedback, tree, ready, claims, recently done, retro, outcome' },
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
        decisions: await q(`select id, kind, statement, status from decisions where id = any($1)`, [task.decision_refs]),
      };
    },
  },
  {
    name: 'list',
    summary: 'The root tasks of this project, most recently touched first. --root: one of them as a tree. --ready: what can be claimed now. --decisions: project-wide memory (or with --root: a tree\'s decisions; with --all: every decision in the project). --search: search tasks, retros, outcomes, and decisions across the project.',
    flags: {
      root: { type: 'string', desc: 'a root task (any task id in its tree will do)' },
      ready: { type: 'bool', desc: 'open, everything it needs is done, no children of its own' },
      decisions: { type: 'bool', desc: 'without --root: standing project-wide memory; with --root: that tree\'s decisions; with --all: all decisions in the project' },
      search: { type: 'string', desc: 'search across tasks (title, goal, interview, feedback, verdict, retro, outcome) and decisions (including archived)' },
      since: { type: 'string', desc: 'with --decisions: ISO time' },
      archived: { type: 'bool', desc: 'include archived roots of this project' },
      all: { type: 'bool', desc: 'every project (or with --decisions: all decisions across roots in this project)' },
    },
    run: async (q, input, ctx) => {
      const root = input.root ? (await load(q, input.root)).root : null;
      if (input.search !== undefined) {
        const term = String(input.search).trim();
        if (!term) refuse('--search needs a query');
        const pattern = `%${term}%`;
        const tasks = await q(
          `select id, root, parent, title, status, goal, feedback, verdict, retro, outcome, updated_at
           from tasks
           where ($1 or project = $2)
             and ($3::text is null or root = $3)
             and (title ilike $4 or goal ilike $4 or coalesce(interview, '') ilike $4
                  or feedback ilike $4 or verdict ilike $4 or retro ilike $4 or outcome ilike $4
                  or word_similarity($5, title || ' ' || goal || ' ' || retro || ' ' || outcome) > 0.35)
           order by updated_at desc limit 20`,
          [!!input.all, ctx.project, root, pattern, term],
        );
        const decisions = await q(
          `select id, root, task, kind, statement, rationale, by, status, superseded_by, at
           from decisions
           where ($1 or project = $2)
             and ($3::text is null or root = $3)
             and (statement ilike $4 or coalesce(rationale, '') ilike $4
                  or word_similarity($5, statement || ' ' || coalesce(rationale, '')) > 0.35)
           order by at desc limit 20`,
          [!!input.all, ctx.project, root, pattern, term],
        );
        return { tasks, decisions };
      }
      if (input.decisions) {
        if (root) {
          return q(`select id, task, kind, statement, rationale, by, status, superseded_by, at from decisions
                    where root = $1 and ($2::timestamptz is null or at >= $2) order by at desc`, [root, input.since ?? null]);
        }
        return q(`select id, root, task, kind, statement, rationale, by, status, superseded_by, at from decisions
                  where project = $1 and ($2 or root is null) and ($3::timestamptz is null or at >= $3) order by at desc`,
          [ctx.project, !!input.all, input.since ?? null]);
      }
      if (input.ready) {
        return q(`select t.id, t.root, t.title, t.scope from tasks t
                  where ${READY} and t.project = $1 and ($2::text is null or t.root = $2) order by t.created_at`, [ctx.project, root]);
      }
      if (!root) {
        return q(`select t.id, t.project, t.title, t.status,
                         (select max(c.updated_at) from tasks c where c.root = t.id) as touched
                  from tasks t where t.parent is null
                  and ($1 or (t.project = $2 and ($3 or t.status <> 'archived'))) order by touched desc`, [!!input.all, ctx.project, !!input.archived]);
      }
      return tree(await q(`select id, parent, title, status, claimed_by from tasks where root = $1 order by created_at`, [root]));
    },
  },
  {
    // For the human at a shell; not one of the operations an agent is offered.
    name: 'doctor', cliOnly: true, summary: 'Which mode this machine is on, where the data lives, and whether it is reachable.',
    run: async (q, input, ctx) => ({
      mode: mode(), home: home(), project: ctx.project, checks: checksFor(ctx.project), review: !!config().review, schema: await version(q),
      tasks: Number((await q(`select count(*) n from tasks`))[0].n),
    }),
  },
];

const CHECK_TIMEOUT_MS = Number(process.env.IDLE_CHECK_TIMEOUT_MS) || 15 * 60_000;
const FAIL_LINE = /^(?:FAIL\b|not ok\b|--- FAIL:|.*(?:AssertionError|Error:|panic:|ERR!))/i;

// The configured commands, run where the work is. → null when green, else what failed.
function runChecks(task, worktree) {
  const cwd = worktree && existsSync(worktree) ? worktree : workdir();
  const env = { ...process.env, IDLE_TASK_ID: task.id, IDLE_TASK_SCOPE: (task.scope ?? []).join(' ') };
  for (const command of checksFor(task.project)) {
    const run = spawnSync(command, { shell: true, cwd, env, encoding: 'utf8', timeout: CHECK_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
    if (run.status === 0) continue;
    const raw = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim();
    const lines = raw ? raw.split('\n') : [];
    const tailLines = lines.slice(-12);
    const highlights = lines.slice(0, -12).filter((l) => FAIL_LINE.test(l.trim())).slice(-6);
    let logNote = '';
    if (lines.length > 12) {
      try {
        const dir = join(tmpdir(), 'idle-checks');
        mkdirSync(dir, { recursive: true });
        const logPath = join(dir, `${task.id}.log`);
        writeFileSync(logPath, `${raw}\n`);
        logNote = `\n(full log: ${logPath})`;
      } catch { /* best effort */ }
    }
    const snippet = highlights.length
      ? `${highlights.join('\n').slice(0, 240)}\n…\n${tailLines.join('\n').slice(-350)}`
      : tailLines.join('\n').slice(-600);
    return `\`${command}\` ${run.error ? `did not run (${run.error.code ?? run.error.message})` : `exited ${run.status}`}\n${snippet}${logNote}`;
  }
  return null;
}

// One call = one transaction. A task left in `submitted` is then verified by the
// system itself, outside any transaction, and moved on or sent back — no agent's word.
export async function runOp(op, input, ctx) {
  const result = await withTx((q) => op.run(q, input, ctx));
  if (op.name !== 'task' || input.status !== 'submitted' || result?.status !== 'submitted') return result;
  // The worktree is usually recorded once, on the root; a task may name its own.
  const [where] = await withTx((q) => q(
    `with recursive up as (select id, parent, metadata, 0 as depth from tasks where id = $1
       union all select t.id, t.parent, t.metadata, up.depth + 1 from tasks t join up on t.id = up.parent)
     select metadata->>'worktree' as worktree from up where metadata ? 'worktree' order by depth limit 1`, [result.id]));
  const failed = runChecks(result, where?.worktree);
  return withTx(async (q) => {
    const task = await load(q, result.id);
    if (task.status !== 'submitted') return task;
    if (failed) {
      await append(q, task.id, 'verdict', `checks failed — ${failed}`, 'idle');
      await bump(q, task.id, 'check_failures');
      await setStatus(q, task.id, 'open', ', claimed_by = null');
      return load(q, task.id);
    }
    await setStatus(q, task.id, 'verified');
    return settle(q, task.id);
  });
}
