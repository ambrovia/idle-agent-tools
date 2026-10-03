// The Postgres store — PGlite locally, any Postgres shared. Every question the
// operations ask of storage, answered in SQL inside the caller's transaction.
// q(sql, params) → rows. Rows come back as the tasks and decisions tables define them.

import { version } from './schema.mjs';

const LIVE = `status = 'claimed' and claim_expires > now()`;
const READY = `
  (t.status = 'open' or (t.status = 'claimed' and t.claim_expires <= now()))
  and not exists (select 1 from tasks n where n.id = any(t.needs) and n.status <> 'done')
  and not exists (select 1 from tasks c where c.parent = t.id)`;

// Near-duplicates only. Measured: a typo or reworded title scores 0.7–0.95, siblings that
// merely share a prefix ("Newsletter signup form" / "… API endpoint") about 0.5.
const SIMILAR = 0.65;

const JSON_COLUMNS = new Set(['metadata']);

function assignments(fields, params) {
  return Object.entries(fields).map(([column, value]) => {
    params.push(JSON_COLUMNS.has(column) ? JSON.stringify(value) : value);
    return `${column} = $${params.length}${JSON_COLUMNS.has(column) ? '::jsonb' : ''}`;
  });
}

export function pgStore(q) {
  return {
    task: async (id) => (await q(`select * from tasks where id = $1`, [id]))[0] ?? null,
    tasks: (ids) => q(`select * from tasks where id = any($1)`, [ids]),
    children: (id) => q(`select * from tasks where parent = $1 order by created_at`, [id]),
    treeRows: (root) => q(`select * from tasks where root = $1 order by created_at`, [root]),
    // Root first, the task itself last.
    lineage: (id) => q(
      `with recursive up as (
         select t.*, 0 as depth from tasks t where id = $1
         union all select t.*, up.depth + 1 from tasks t join up on t.id = up.parent)
       select * from up order by depth desc`, [id]),
    // The task and everything under it.
    subtree: (id) => q(
      `with recursive down as (select id, status from tasks where id = $1
         union all select t.id, t.status from tasks t join down on t.parent = down.id)
       select * from down`, [id]),
    roots: ({ project, all, archived }) => q(
      `select t.id, t.project, t.title, t.status,
              (select max(c.updated_at) from tasks c where c.root = t.id) as touched
       from tasks t where t.parent is null
       and ($1 or (t.project = $2 and ($3 or t.status <> 'archived'))) order by touched desc`, [!!all, project, !!archived]),
    ready: ({ project = null, root = null }) => q(
      `select t.id, t.root, t.title, t.scope from tasks t
       where ${READY} and ($1::text is null or t.project = $1) and ($2::text is null or t.root = $2)
       order by t.created_at`, [project, root]),
    liveClaims: (root) => q(`select id, title, claimed_by, scope, claim_expires from tasks where root = $1 and ${LIVE}`, [root]),
    // Asked of the database, not this machine's clock: on a shared database they differ.
    isLive: async (id) => !!(await q(`select (${LIVE}) as live from tasks where id = $1`, [id]))[0]?.live,
    similarTasks: ({ title, root, project }) => q(
      `select id, title, status from tasks
       where status not in ('done', 'archived')
         and (($2::text is not null and root = $2) or ($2::text is null and project = $3 and parent is null))
         and similarity(title, $1) > ${SIMILAR}
       order by similarity(title, $1) desc limit 5`, [title, root, project]),
    insertTask: ({ id, project, parent, root, title, status }) => q(
      `insert into tasks(id, project, parent, root, title, status) values ($1, $2, $3, $4, $5, $6)`,
      [id, project, parent, root, title, status]),
    update: async (id, fields) => {
      const params = [id];
      const sets = assignments(fields, params);
      if (sets.length) await q(`update tasks set ${sets.join(', ')}, updated_at = now() where id = $1`, params);
    },
    append: (id, field, line) => q(`update tasks set ${field} = ${field} || $2, updated_at = now() where id = $1`, [id, line]),
    lease: (id, by, minutes) => q(
      `update tasks set status = 'claimed', claimed_by = $2, claim_expires = now() + make_interval(secs => $3::float8 * 60), updated_at = now() where id = $1`,
      [id, by, minutes]),
    // Serialises claims within one tree, on any Postgres; held to the end of the transaction.
    lockTree: (root) => q(`select pg_advisory_xact_lock(hashtext($1))`, [root]),

    decision: async (id) => (await q(`select * from decisions where id = $1`, [id]))[0] ?? null,
    decisions: (ids) => q(`select * from decisions where id = any($1) order by at`, [ids]),
    decisionsInRoot: (root, { since = null } = {}) => q(
      `select * from decisions where root = $1 and ($2::timestamptz is null or at >= $2) order by at desc`, [root, since]),
    similarDecisions: (root, statement) => q(
      `select id, statement from decisions where root = $1 and status = 'active'
       and similarity(statement, $2) > ${SIMILAR} limit 5`, [root, statement]),
    insertDecision: ({ id, project, root, task, statement, rationale, by }) => q(
      `insert into decisions(id, project, root, task, statement, rationale, by) values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, project, root, task, statement, rationale, by]),
    updateDecision: async (id, fields) => {
      const params = [id];
      const sets = assignments(fields, params);
      if (sets.length) await q(`update decisions set ${sets.join(', ')} where id = $1`, params);
    },
    bindDecision: (taskId, decisionId) => q(
      `update tasks set decision_refs = array_append(decision_refs, $2) where id = $1 and not ($2 = any(decision_refs))`, [taskId, decisionId]),

    version: () => version(q),
    count: async () => Number((await q(`select count(*) n from tasks`))[0].n),
  };
}
