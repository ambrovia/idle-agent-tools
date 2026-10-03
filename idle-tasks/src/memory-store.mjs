// A store over an in-memory snapshot of every task and decision — the same questions
// pg-store.mjs answers in SQL, answered in JS. A backend without transactions (Linear)
// loads a snapshot, lets one operation run against it, then writes back only what changed:
// a refused operation writes nothing, as a rolled-back transaction would.

const LEASE_LIVE = (t, now) => t.status === 'claimed' && t.claim_expires && t.claim_expires > now;

// pg_trgm's similarity(): lower-cased words, padded "  word ", sets of 3-grams, |A∩B| / |A∪B|.
function trigrams(text) {
  const grams = new Set();
  for (const word of String(text).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) grams.add(padded.slice(i, i + 3));
  }
  return grams;
}
export function similarity(a, b) {
  const [x, y] = [trigrams(a), trigrams(b)];
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const g of x) if (y.has(g)) shared++;
  return shared / (x.size + y.size - shared);
}
const SIMILAR = 0.65; // as pg-store.mjs

const byCreated = (a, b) => a.created_at - b.created_at;

export function newTask(fields, now = new Date()) {
  return {
    id: null, project: null, parent: null, root: null, title: '', goal: '', acceptance_criteria: null,
    scope: [], needs: [], decision_refs: [], status: 'open', claimed_by: null, claim_expires: null,
    feedback: '', verdict: '', plan: null, interview: null, consumer_scenario: null, metadata: {},
    created_at: now, updated_at: now, ...fields,
  };
}

export function newDecision(fields, now = new Date()) {
  return { id: null, project: null, root: null, task: null, statement: '', rationale: null, by: null, status: 'active', superseded_by: null, at: now, ...fields };
}

// data: { tasks: [...rows], decisions: [...rows] }, mutated in place. Every write marks its row
// in data.dirty so the backend knows what to send.
export function memoryStore(data, { now = () => new Date(), version = () => 1 } = {}) {
  data.dirty ??= new Set();
  const tasks = () => data.tasks;
  const find = (id) => tasks().find((t) => t.id === id) ?? null;
  const touch = (row) => { row.updated_at = now(); data.dirty.add(row); };
  const live = (t) => LEASE_LIVE(t, now());
  const ready = (t) => (t.status === 'open' || (t.status === 'claimed' && !live(t)))
    && t.needs.every((n) => find(n)?.status === 'done')
    && !tasks().some((c) => c.parent === t.id);

  return {
    task: async (id) => find(id),
    tasks: async (ids) => tasks().filter((t) => ids.includes(t.id)),
    children: async (id) => tasks().filter((t) => t.parent === id).sort(byCreated),
    treeRows: async (root) => tasks().filter((t) => t.root === root).sort(byCreated),
    lineage: async (id) => {
      const line = [];
      for (let t = find(id); t; t = t.parent ? find(t.parent) : null) line.unshift(t);
      return line;
    },
    subtree: async (id) => {
      const down = [find(id)].filter(Boolean);
      for (let i = 0; i < down.length; i++) down.push(...tasks().filter((t) => t.parent === down[i].id));
      return down.map(({ id: d, status }) => ({ id: d, status }));
    },
    roots: async ({ project, all, archived }) => tasks()
      .filter((t) => !t.parent && (all || (t.project === project && (archived || t.status !== 'archived'))))
      .map((t) => ({
        id: t.id, project: t.project, title: t.title, status: t.status,
        touched: new Date(Math.max(...tasks().filter((c) => c.root === t.id).map((c) => +c.updated_at))),
      }))
      .sort((a, b) => b.touched - a.touched),
    ready: async ({ project = null, root = null }) => tasks()
      .filter((t) => ready(t) && (project === null || t.project === project) && (root === null || t.root === root))
      .sort(byCreated)
      .map(({ id, root: r, title, scope }) => ({ id, root: r, title, scope })),
    liveClaims: async (root) => tasks().filter((t) => t.root === root && live(t))
      .map(({ id, title, claimed_by, scope, claim_expires }) => ({ id, title, claimed_by, scope, claim_expires })),
    isLive: async (id) => { const t = find(id); return !!t && live(t); },
    similarTasks: async ({ title, root, project }) => tasks()
      .filter((t) => !['done', 'archived'].includes(t.status)
        && (root !== null ? t.root === root : t.project === project && !t.parent))
      .map((t) => ({ t, score: similarity(t.title, title) }))
      .filter(({ score }) => score > SIMILAR)
      .sort((a, b) => b.score - a.score).slice(0, 5)
      .map(({ t }) => ({ id: t.id, title: t.title, status: t.status })),
    insertTask: async (fields) => { const row = newTask(fields, now()); data.tasks.push(row); data.dirty.add(row); },
    update: async (id, fields) => { const t = find(id); if (t && Object.keys(fields).length) { Object.assign(t, fields); touch(t); } },
    append: async (id, field, line) => { const t = find(id); t[field] = `${t[field] ?? ''}${line}`; touch(t); },
    lease: async (id, by, minutes) => {
      const t = find(id);
      Object.assign(t, { status: 'claimed', claimed_by: by, claim_expires: new Date(+now() + minutes * 60_000) });
      touch(t);
    },
    // One process at a time already: the backend holds the machine's lock around the whole operation.
    lockTree: async () => {},

    decision: async (id) => data.decisions.find((d) => d.id === id) ?? null,
    decisions: async (ids) => data.decisions.filter((d) => ids.includes(d.id)).sort((a, b) => a.at - b.at),
    decisionsInRoot: async (root, { since = null } = {}) => data.decisions
      .filter((d) => d.root === root && (since === null || d.at >= new Date(since)))
      .sort((a, b) => b.at - a.at),
    similarDecisions: async (root, statement) => data.decisions
      .filter((d) => d.root === root && d.status === 'active' && similarity(d.statement, statement) > SIMILAR)
      .slice(0, 5).map(({ id, statement: s }) => ({ id, statement: s })),
    insertDecision: async (fields) => { const row = newDecision(fields, now()); data.decisions.push(row); data.dirty.add(row); },
    updateDecision: async (id, fields) => { const d = data.decisions.find((x) => x.id === id); Object.assign(d, fields); data.dirty.add(d); },
    bindDecision: async (taskId, decisionId) => {
      const t = find(taskId);
      if (!t.decision_refs.includes(decisionId)) { t.decision_refs = [...t.decision_refs, decisionId]; data.dirty.add(t); }
    },

    version: async () => version(),
    count: async () => tasks().length,
  };
}
