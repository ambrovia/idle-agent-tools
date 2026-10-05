// Linear as the store. Tasks and decisions are issues in one Linear team, one Linear project
// per idle project; what Linear has no field for rides in an attachment idle owns on each issue.
//
// Linear has no transactions, so every operation runs against a snapshot: under the machine's
// lock, load the team's issues, run the operation in memory (memory-store.mjs), then write back
// only the rows it changed. A refused operation writes nothing. Two machines are not serialised:
// the later write wins.
//
// Config (~/.idle/config.json): { "backend": "linear", "linear": { "team": "ENG", "apiKey": "lin_api_…" } }
// The key sits with the rest of this machine's settings, as a database URL does; IDLE_LINEAR_API_KEY overrides it.

import { config, withLock } from './store.mjs';
import { memoryStore } from './memory-store.mjs';
import { graphqlClient } from './linear-client.mjs';
import { fakeClient } from './linear-fake.mjs';

// Where idle keeps its own fields on an issue. A reserved domain, so the URL never resolves.
const META_URL = 'https://idle.invalid/';
const metaUrl = (id) => `${META_URL}${id}`;

export const LABELS = { blocked: 'blocked', decision: 'decision' };

// The description carries what a human reads; the goal is everything before the first known heading.
const SECTIONS = [
  ['acceptance_criteria', 'Signs the goal is reached'],
  ['plan', 'Plan'],
  ['interview', 'Interview'],
  ['consumer_scenario', 'How it is used'],
];

export function renderDescription(task) {
  return [task.goal || '', ...SECTIONS.filter(([field]) => task[field]).map(([field, heading]) => `## ${heading}\n\n${task[field]}`)]
    .filter(Boolean).join('\n\n');
}

export function parseDescription(text = '') {
  const fields = Object.fromEntries(SECTIONS.map(([field]) => [field, null]));
  const known = new Map(SECTIONS.map(([field, heading]) => [heading.toLowerCase(), field]));
  let current = 'goal';
  const parts = { goal: [] };
  for (const line of (text ?? '').split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading && known.has(heading[1].toLowerCase())) { current = known.get(heading[1].toLowerCase()); parts[current] = []; continue; }
    parts[current].push(line);
  }
  for (const [field, lines] of Object.entries(parts)) {
    const body = lines.join('\n').trim();
    fields[field] = field === 'goal' ? body : (body || null);
  }
  return fields;
}

// Workflow states by type, so a team's own names work. Review is the started state named like it.
export function stateMap(states) {
  const of = (type) => states.filter((s) => s.type === type).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const started = of('started');
  const review = started.find((s) => /review/i.test(s.name));
  const working = started.find((s) => !/review/i.test(s.name)) ?? started[0];
  const todo = of('unstarted').find((s) => /^todo$/i.test(s.name)) ?? of('unstarted')[0];
  const byStatus = {
    proposed: (of('triage')[0] ?? of('backlog')[0] ?? todo),
    open: todo, blocked: todo,
    claimed: working, submitted: review ?? working, verified: review ?? working,
    done: of('completed')[0], archived: of('canceled')[0],
  };
  for (const [status, state] of Object.entries(byStatus)) if (!state) throw new Error(`the Linear team has no workflow state for "${status}"`);
  return { byStatus, byId: new Map(states.map((s) => [s.id, s])) };
}

// Linear's state wins when a human moved the issue; idle's own finer status when it agrees.
export function statusFrom(state, labels, recorded) {
  switch (state?.type) {
    case 'triage': case 'backlog': return 'proposed';
    case 'unstarted': return labels.includes(LABELS.blocked) ? 'blocked' : 'open';
    case 'started':
      if (/review/i.test(state.name)) return ['submitted', 'verified'].includes(recorded) ? recorded : 'submitted';
      return 'claimed';
    case 'completed': return 'done';
    case 'canceled': return 'archived';
    default: return recorded ?? 'open';
  }
}

const date = (v) => (v ? new Date(v) : null);

async function load(client, cfg) {
  const team = await client.team(cfg.team);
  const states = stateMap(team.states);
  const labels = new Map(team.labels.map((l) => [l.name, l.id]));
  const labelNames = new Map(team.labels.map((l) => [l.id, l.name]));
  const projects = new Map((await client.projects(team.id)).map((p) => [p.id, p.name]));
  const issues = await client.issues(team.id);
  const ids = new Map(issues.map((i) => [i.id, i.meta?.id ?? i.identifier])); // Linear uuid → idle id
  const data = { tasks: [], decisions: [] };
  const linked = new Map(); // row → { issue, sent }

  for (const issue of issues) {
    const meta = issue.meta ?? {};
    const names = issue.labelIds.map((id) => labelNames.get(id)).filter(Boolean);
    const state = states.byId.get(issue.stateId);
    if (names.includes(LABELS.decision)) {
      const row = {
        id: ids.get(issue.id), project: projects.get(issue.projectId), root: meta.root ?? null, task: meta.task ?? null,
        statement: issue.title, rationale: issue.description || null, by: meta.by ?? null,
        status: state?.type === 'canceled' ? 'superseded' : 'active', superseded_by: meta.superseded_by ?? null,
        at: date(meta.at) ?? date(issue.createdAt),
      };
      data.decisions.push(row);
      linked.set(row, { issue, kind: 'decision' });
      continue;
    }
    const row = {
      id: ids.get(issue.id), project: projects.get(issue.projectId),
      parent: issue.parentId ? ids.get(issue.parentId) ?? null : null, root: null,
      title: issue.title, ...parseDescription(issue.description),
      scope: meta.scope ?? [], needs: meta.needs ?? [], decision_refs: meta.decision_refs ?? [],
      status: statusFrom(state, names, meta.status),
      claimed_by: meta.claimed_by ?? null, claim_expires: date(meta.claim_expires),
      feedback: meta.feedback ?? '', verdict: meta.verdict ?? '', metadata: meta.metadata ?? {},
      created_at: date(issue.createdAt), updated_at: date(issue.updatedAt),
    };
    data.tasks.push(row);
    linked.set(row, { issue, kind: 'task' });
  }
  // The root is wherever the parent chain ends.
  const byId = new Map(data.tasks.map((t) => [t.id, t]));
  for (const t of data.tasks) {
    let top = t;
    for (const seen = new Set(); top.parent && byId.has(top.parent) && !seen.has(top.id); seen.add(top.id)) top = byId.get(top.parent);
    t.root = top.id;
  }
  return { team, states, labels, projects, data, linked };
}

function taskMeta(t) {
  return {
    id: t.id, status: t.status, scope: t.scope, needs: t.needs, decision_refs: t.decision_refs,
    claimed_by: t.claimed_by, claim_expires: t.claim_expires?.toISOString() ?? null,
    feedback: t.feedback, verdict: t.verdict, metadata: t.metadata,
  };
}

function decisionMeta(d) {
  return { id: d.id, root: d.root, task: d.task, by: d.by, superseded_by: d.superseded_by, at: d.at?.toISOString() ?? null };
}

async function flush(client, snap) {
  const { team, states, labels, projects, data, linked } = snap;
  const uuidOf = new Map([...linked].map(([row, { issue }]) => [row.id, issue.id]));
  const label = async (name) => {
    if (!labels.has(name)) labels.set(name, (await client.createLabel(team.id, name)).id);
    return labels.get(name);
  };
  const project = async (name) => {
    for (const [id, n] of projects) if (n === name) return id;
    const made = await client.createProject(name, team.id);
    projects.set(made.id, made.name);
    return made.id;
  };
  const withLabel = async (current, name, on) => {
    const id = await label(name);
    const rest = current.filter((l) => l !== id);
    return on ? [...rest, id] : rest;
  };

  for (const row of data.dirty) {
    const kind = 'statement' in row ? 'decision' : 'task';
    const was = linked.get(row)?.issue;
    const fields = kind === 'task'
      ? { title: row.title, description: renderDescription(row), stateId: states.byStatus[row.status].id }
      : { title: row.statement, description: row.rationale ?? '', stateId: states.byStatus[row.status === 'superseded' ? 'archived' : 'done'].id };
    const labelIds = kind === 'task'
      ? await withLabel(was?.labelIds ?? [], LABELS.blocked, row.status === 'blocked')
      : await withLabel(was?.labelIds ?? [], LABELS.decision, true);
    const parentId = kind === 'task' && row.parent ? uuidOf.get(row.parent) ?? null : null;

    let uuid = was?.id;
    if (!uuid) {
      const made = await client.createIssue({ teamId: team.id, projectId: await project(row.project), parentId, labelIds, ...fields });
      uuid = made.id;
      uuidOf.set(row.id, uuid);
      linked.set(row, { issue: { id: uuid, labelIds }, kind });
    } else {
      const changed = Object.fromEntries(Object.entries({ ...fields, labelIds }).filter(([k, v]) => JSON.stringify(was[k]) !== JSON.stringify(v)));
      if (Object.keys(changed).length) await client.updateIssue(uuid, changed);
    }
    const meta = kind === 'task' ? taskMeta(row) : decisionMeta(row);
    await client.saveAttachment({ issueId: uuid, url: metaUrl(row.id), title: `idle ${row.id}`, metadata: meta });
    if (kind === 'task') {
      // Mirrored for whoever reads the issue in Linear; idle reads needs from its own field.
      for (const need of row.needs.filter((n) => !(was?.meta?.needs ?? []).includes(n))) {
        if (uuidOf.has(need)) await client.blocks(uuidOf.get(need), uuid);
      }
    }
  }
}

function client() {
  const cfg = config().linear ?? {};
  if (process.env.IDLE_LINEAR_FAKE) return fakeClient(process.env.IDLE_LINEAR_FAKE);
  const key = process.env.IDLE_LINEAR_API_KEY || cfg.apiKey;
  if (!key) throw new Error('no Linear API key: set linear.apiKey in ~/.idle/config.json');
  return graphqlClient(key);
}

export async function withLinear(fn) {
  const cfg = config().linear ?? {};
  if (!cfg.team) throw new Error('backend "linear" needs linear.team in ~/.idle/config.json');
  const linear = client();
  return withLock(async () => {
    const snap = await load(linear, cfg);
    const result = await fn(memoryStore(snap.data, { version: () => 'linear' }));
    await flush(linear, snap);
    return result;
  });
}
