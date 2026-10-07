const SIMILAR = 0.65;

function trigrams(text) {
  const grams = new Set();
  for (const word of String(text).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    for (let i = 0, w = `  ${word} `; i + 3 <= w.length; i++) grams.add(w.slice(i, i + 3));
  }
  return grams;
}

function similarity(a, b) {
  const [x, y] = [trigrams(a), trigrams(b)];
  const shared = [...x].filter((g) => y.has(g)).length;
  return shared / (x.size + y.size - shared || 1);
}

export function records(data) {
  const { tasks, decisions } = data;
  data.dirty = new Set();
  const find = (id) => tasks.find((t) => t.id === id);
  const touch = (row) => { row.updated_at = new Date(); data.dirty.add(row); };
  const live = (t) => t.status === 'claimed' && t.claim_expires > new Date();
  const ready = (t) => (t.status === 'open' || (t.status === 'claimed' && !live(t)))
    && t.needs.every((n) => find(n)?.status === 'done') && !tasks.some((c) => c.parent === t.id);
  const byCreated = (a, b) => a.created_at - b.created_at;
  const similar = (rows, text, field) => rows.map((r) => [r, similarity(r[field], text)]).filter(([, score]) => score > SIMILAR)
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r]) => r);

  return {
    tasks: (ids) => tasks.filter((t) => ids.includes(t.id)),
    children: (id) => tasks.filter((t) => t.parent === id).sort(byCreated),
    treeRows: (root) => tasks.filter((t) => t.root === root).sort(byCreated),
    lineage: (id) => { const line = []; for (let t = find(id); t; t = find(t.parent)) line.unshift(t); return line; },
    roots: ({ project, all, archived }) => tasks
      .filter((t) => !t.parent && (all || (t.project === project && (archived || t.status !== 'archived'))))
      .map((t) => ({ id: t.id, project: t.project, title: t.title, status: t.status,
        touched: new Date(Math.max(...tasks.filter((c) => c.root === t.id).map((c) => c.updated_at))) }))
      .sort((a, b) => b.touched - a.touched),
    ready: ({ project = null, root = null }) => tasks
      .filter((t) => ready(t) && (project === null || t.project === project) && (root === null || t.root === root)).sort(byCreated),
    liveClaims: (root) => tasks.filter((t) => t.root === root && live(t)),
    similarTasks: ({ title, root, project }) => similar(tasks.filter((t) => !['done', 'archived'].includes(t.status)
      && (root !== null ? t.root === root : t.project === project && !t.parent)), title, 'title'),
    insertTask: (fields) => {
      const now = new Date();
      const row = Object.assign({ id: null, project: null, parent: null, root: null, title: '', goal: '', acceptance_criteria: null,
        scope: [], needs: [], decision_refs: [], status: 'open', claimed_by: null, claim_expires: null, feedback: '', verdict: '',
        plan: null, interview: null, consumer_scenario: null, metadata: {}, created_at: now, updated_at: now }, fields);
      tasks.push(row);
      data.dirty.add(row);
    },
    update: (id, fields) => { if (Object.keys(fields).length) touch(Object.assign(find(id), fields)); },
    append: (id, field, line) => { const t = find(id); t[field] += line; touch(t); },
    lease: (id, by, minutes) => touch(Object.assign(find(id), { status: 'claimed', claimed_by: by, claim_expires: new Date(Date.now() + minutes * 60_000) })),

    decisions: (ids) => decisions.filter((d) => ids.includes(d.id)).sort((a, b) => a.at - b.at),
    decisionsInRoot: (root, { since = null } = {}) => decisions
      .filter((d) => d.root === root && (since === null || d.at >= new Date(since))).sort((a, b) => b.at - a.at),
    similarDecisions: (root, statement) => similar(decisions.filter((d) => d.root === root && d.status === 'active'), statement, 'statement'),
    insertDecision: (fields) => {
      const row = Object.assign({ id: null, project: null, root: null, task: null, statement: '', rationale: null, by: null, status: 'active', superseded_by: null, at: new Date() }, fields);
      decisions.push(row);
      data.dirty.add(row);
    },
    updateDecision: (id, fields) => { data.dirty.add(Object.assign(decisions.find((d) => d.id === id), fields)); },

    count: () => tasks.length,
  };
}
