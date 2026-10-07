
import { config, withLock } from './store.mjs';
import { project } from './context.mjs';
import { graphqlClient } from './linear-client.mjs';
import { fakeClient } from './linear-fake.mjs';

export async function withData(fn) {
  const cfg = config().linear ?? {};
  if (!cfg.team) throw new Error('this repository keeps its tasks in Linear but names no team: add { "linear": { "team": "…" } } to .idle.json at its root');
  const key = process.env.IDLE_LINEAR_API_KEY || cfg.apiKey;
  if (!key && !process.env.IDLE_LINEAR_FAKE) throw new Error('no Linear API key: set linear.apiKey in ~/.idle/config.json');
  const linear = process.env.IDLE_LINEAR_FAKE ? fakeClient(process.env.IDLE_LINEAR_FAKE) : graphqlClient(key);
  return withLock(async () => {
    const data = await load(linear, cfg, project());
    const result = await fn(data);
    await save(linear, data);
    return result;
  });
}

const META_URL = 'https://idle.invalid/';
const SECTIONS = [
  ['acceptance_criteria', 'Signs the goal is reached'],
  ['plan', 'Plan'],
  ['interview', 'Interview'],
  ['consumer_scenario', 'How it is used'],
];
const describe = (t) => [t.goal, ...SECTIONS.filter(([f]) => t[f]).map(([f, h]) => `## ${h}\n\n${t[f]}`)].filter(Boolean).join('\n\n');

function parse(text) {
  const fields = { goal: [] };
  let current = 'goal';
  for (const line of (text ?? '').split('\n')) {
    const field = SECTIONS.find(([, h]) => line.match(/^##\s+(.+?)\s*$/)?.[1].toLowerCase() === h.toLowerCase())?.[0];
    if (field) fields[(current = field)] = [];
    else fields[current].push(line);
  }
  const out = { goal: fields.goal.join('\n').trim() };
  for (const [f] of SECTIONS) out[f] = fields[f]?.join('\n').trim() || null;
  return out;
}
function states(all) {
  const of = (type) => all.filter((s) => s.type === type).sort((a, b) => a.position - b.position);
  const review = of('started').find((s) => /review/i.test(s.name));
  const working = of('started').find((s) => s !== review) ?? review;
  const todo = of('unstarted').find((s) => /^todo$/i.test(s.name)) ?? of('unstarted')[0];
  const to = {
    proposed: of('triage')[0] ?? of('backlog')[0] ?? todo, open: todo, blocked: todo,
    claimed: working, submitted: review ?? working, verified: review ?? working,
    done: of('completed')[0], archived: of('canceled')[0],
  };
  for (const [status, state] of Object.entries(to)) if (!state) throw new Error(`the Linear team has no workflow state for "${status}"`);
  return to;
}
function status(state, blocked, recorded) {
  switch (state?.type) {
    case 'triage': case 'backlog': return 'proposed';
    case 'unstarted': return blocked ? 'blocked' : 'open';
    case 'started': return /review/i.test(state.name) ? (recorded === 'verified' ? 'verified' : 'submitted') : 'claimed';
    case 'completed': return 'done';
    case 'canceled': case 'duplicate': return 'archived';
    default: return recorded ?? 'open';
  }
}

const date = (v) => (v ? new Date(v) : null);

async function load(linear, cfg, label) {
  const team = await linear.team(cfg.team);
  const labels = new Map(team.labels.map((l) => [l.name, l.id]));
  const name = cfg.project ?? label;
  const projectId = (await linear.projects(team.id)).find((p) => p.name === name)?.id;
  const issues = projectId ? await linear.issues(team.id, projectId) : [];
  const idOf = new Map(issues.map((i) => [i.id, i.meta?.id ?? i.identifier]));
  const tasks = []; const decisions = [];
  for (const i of issues) {
    const m = i.meta ?? {};
    const state = team.states.find((s) => s.id === i.stateId);
    const base = { id: idOf.get(i.id), project: label };
    if (i.labelIds.includes(labels.get('decision'))) {
      decisions.push({ ...base, root: m.root ?? null, task: m.task ?? null, statement: i.title, rationale: i.description || null, by: m.by ?? null,
        status: state?.type === 'canceled' ? 'superseded' : 'active', superseded_by: m.superseded_by ?? null, at: date(m.at ?? i.createdAt) });
      continue;
    }
    tasks.push({ ...base, parent: idOf.get(i.parentId) ?? null, title: i.title, ...parse(i.description),
      scope: m.scope ?? [], needs: m.needs ?? [], decision_refs: m.decision_refs ?? [],
      status: status(state, i.labelIds.includes(labels.get('blocked')), m.status),
      claimed_by: m.claimed_by ?? null, claim_expires: date(m.claim_expires), feedback: m.feedback ?? '', verdict: m.verdict ?? '',
      metadata: m.metadata ?? {}, created_at: date(i.createdAt), updated_at: date(i.updatedAt) });
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const rootOf = (t, seen = new Set()) => (byId.has(t.parent) && !seen.has(t.id) ? rootOf(byId.get(t.parent), seen.add(t.id)) : t.id);
  for (const t of tasks) t.root = rootOf(t);
  return { team, labels, project: { name, id: projectId }, issues: new Map(issues.map((i) => [idOf.get(i.id), i])), tasks, decisions };
}

async function save(linear, { team, labels, project, issues, dirty }) {
  const to = states(team.states);
  const label = async (name) => labels.get(name) ?? labels.set(name, (await linear.createLabel(team.id, name)).id).get(name);
  for (const row of dirty) {
    const was = issues.get(row.id);
    const decision = 'statement' in row;
    const on = decision ? 'decision' : 'blocked';
    const labelIds = [...(was?.labelIds ?? []).filter((l) => l !== labels.get(on)), ...(decision || row.status === 'blocked' ? [await label(on)] : [])];
    const fields = decision
      ? { title: row.statement, description: row.rationale ?? '', stateId: to[row.status === 'superseded' ? 'archived' : 'done'].id, labelIds }
      : { title: row.title, description: describe(row), stateId: to[row.status].id, labelIds, parentId: issues.get(row.parent)?.id ?? null };
    const meta = decision
      ? { id: row.id, root: row.root, task: row.task, by: row.by, superseded_by: row.superseded_by, at: row.at }
      : { id: row.id, status: row.status, scope: row.scope, needs: row.needs, decision_refs: row.decision_refs, claimed_by: row.claimed_by,
          claim_expires: row.claim_expires, feedback: row.feedback, verdict: row.verdict, metadata: row.metadata };
    let id = was?.id;
    if (!id) {
      project.id ??= (await linear.createProject(project.name, team.id)).id;
      id = (await linear.createIssue({ teamId: team.id, projectId: project.id, ...fields })).id;
      issues.set(row.id, { id, labelIds });
    } else {
      const changed = Object.fromEntries(Object.entries(fields).filter(([k, v]) => JSON.stringify(was[k] ?? null) !== JSON.stringify(v)));
      if (Object.keys(changed).length) await linear.updateIssue(id, changed);
    }
    await linear.saveAttachment({ issueId: id, url: META_URL + row.id, title: `idle ${row.id}`, metadata: meta });
    for (const need of decision ? [] : row.needs.filter((n) => !was?.meta?.needs?.includes(n) && issues.has(n))) await linear.blocks(issues.get(need).id, id);
  }
}
