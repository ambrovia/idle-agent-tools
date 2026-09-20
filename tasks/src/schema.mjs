// Schema — migrations run inside the caller's transaction; a caller that has to
// migrate takes an advisory lock so two first-timers do not both create it.
// Two tables — tasks and decisions — and nothing else. Caps are CHECK constraints: the database refuses an essay whoever wrote the client.

export const CAPS = { title: 120, goal: 4000, acceptance: 2000, scenario: 2000, plan: 8000, interview: 20000, entry: 1000, log: 8000, statement: 300, rationale: 1000 };

const MIGRATIONS = [
  `
  create extension if not exists pg_trgm;

  create table tasks (
    id text primary key,
    project text not null,
    parent text references tasks(id),
    root text not null,
    title text not null check (char_length(title) between 1 and ${CAPS.title}),
    goal text not null default '' check (char_length(goal) <= ${CAPS.goal}),
    acceptance_criteria text check (char_length(acceptance_criteria) <= ${CAPS.acceptance}),
    checks jsonb not null default '[]',
    scope text[] not null default '{}',
    needs text[] not null default '{}',
    decision_refs text[] not null default '{}',
    status text not null default 'open'
      check (status in ('proposed','open','claimed','submitted','verified','done','blocked','archived')),
    claimed_by text,
    claim_expires timestamptz,
    feedback text not null default '' check (char_length(feedback) <= ${CAPS.log}),
    verdict text not null default '' check (char_length(verdict) <= ${CAPS.log}),
    plan text check (char_length(plan) <= ${CAPS.plan}),
    interview text check (char_length(interview) <= ${CAPS.interview}),
    consumer_scenario text check (char_length(consumer_scenario) <= ${CAPS.scenario}),
    metadata jsonb not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index tasks_root on tasks(root);
  create index tasks_parent on tasks(parent);
  create index tasks_title_trgm on tasks using gin (title gin_trgm_ops);

  create table decisions (
    id text primary key,
    project text not null,
    root text not null,
    task text not null references tasks(id),
    statement text not null check (char_length(statement) between 1 and ${CAPS.statement}),
    rationale text check (char_length(rationale) <= ${CAPS.rationale}),
    by text,
    status text not null default 'active' check (status in ('active','superseded')),
    superseded_by text references decisions(id),
    at timestamptz not null default now()
  );
  create index decisions_root on decisions(root);
  `,
];

export async function migrate(q) {
  if ((await version(q)) >= MIGRATIONS.length) return;
  // Only a migrating caller takes the lock; it is held to the end of its transaction.
  await q(`select pg_advisory_xact_lock(hashtext('idle:migrate'))`);
  await q(`create table if not exists meta (key text primary key, value text not null)`);
  for (let v = await version(q); v < MIGRATIONS.length; v++) {
    // One statement per call: the wire protocol refuses several at once with parameters.
    for (const sql of MIGRATIONS[v].split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q(sql);
  }
  await q(`insert into meta(key, value) values ('schema', $1)
           on conflict (key) do update set value = excluded.value`, [String(MIGRATIONS.length)]);
}

export async function version(q) {
  const [{ t }] = await q(`select to_regclass('meta') as t`);
  if (!t) return 0;
  const [row] = await q(`select value from meta where key = 'schema'`);
  return row ? Number(row.value) : 0;
}
