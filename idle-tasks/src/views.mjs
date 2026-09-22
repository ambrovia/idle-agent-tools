// Views — markdown for a cold reader. The brief is what a worker starts from;
// the state is what the planner and the human read before the next move.

import { checksFor } from './store.mjs';

const LIVE = `status = 'claimed' and claim_expires > now()`;
const firstLine = (text, max = 200) => { const line = (text || '').split('\n')[0]; return line.length > max ? `${line.slice(0, max)}…` : line; };
const section = (title, body) => (body && body.trim() ? `\n## ${title}\n\n${body.trim()}\n` : '');
const bullets = (rows, fn) => rows.map((r) => `- ${fn(r)}`).join('\n');

export function tree(rows) {
  const lines = [];
  const walk = (parent, depth) => rows.filter((r) => r.parent === parent).forEach((r) => {
    lines.push(`${'  '.repeat(depth)}${r.id}  [${r.status}${r.status === 'claimed' ? ` ${r.claimed_by}` : ''}]  ${r.title}`);
    walk(r.id, depth + 1);
  });
  walk(null, 0);
  return lines.join('\n');
}

// Root first, the task itself last.
async function lineage(q, taskId) {
  return q(
    `with recursive up as (
       select t.*, 0 as depth from tasks t where id = $1
       union all select t.*, up.depth + 1 from tasks t join up on t.id = up.parent)
     select * from up order by depth desc`, [taskId]);
}

export async function brief(q, task) {
  const line = await lineage(q, task.id);
  const ancestors = line.slice(0, -1);
  const planned = [...line].reverse().find((t) => t.plan);
  const refs = [...new Set(line.flatMap((t) => t.decision_refs))];
  const decisions = await q(`select id, statement, rationale from decisions where id = any($1) and status = 'active' order by at`, [refs]);
  const needs = await q(`select id, title, status, goal from tasks where id = any($1)`, [task.needs]);
  const where = Object.assign({}, ...line.map((t) => t.metadata)); // root first, so a task's own entries win
  return [
    `# ${task.id} — ${task.title}  [${task.status}]\n`,
    section('Goal', task.goal || '_No goal written. Ask before guessing._'),
    section('What this is for', bullets(ancestors, (t) => `**${t.title}** — ${firstLine(t.goal)}`)),
    section('Signs the goal is reached', task.acceptance_criteria),
    section('Why it came back', task.verdict),
    section('Checks — the system runs these when you submit', bullets(checksFor(task.project), (c) => `\`${c}\``)),
    section('Scope', bullets(task.scope, (s) => `\`${s}\``)),
    section(`Plan${planned && planned.id !== task.id ? ` (from ${planned.id})` : ''}`, planned?.plan),
    section('Decisions in force', bullets(decisions, (d) => `${d.id}: ${d.statement}${d.rationale ? ` — ${firstLine(d.rationale)}` : ''}`)),
    section('Builds on', bullets(needs, (n) => `${n.id} [${n.status}] **${n.title}** — ${firstLine(n.goal)}`)),
    section('Where', Object.keys(where).length ? `\`${JSON.stringify(where)}\`` : ''),
    '\nThe goal is the contract; the signs and the checks only help you tell. Done means the goal is reached.\n',
  ].join('');
}

export async function state(q, root) {
  const rows = await q(`select * from tasks where root = $1 order by created_at`, [root.id]);
  const superseded = (await q(`select id from decisions where root = $1 and status = 'superseded'`, [root.id])).map((d) => d.id);
  const ready = await q(
    `select t.id, t.title from tasks t where t.root = $1
       and (t.status = 'open' or (t.status = 'claimed' and t.claim_expires <= now()))
       and not exists (select 1 from tasks n where n.id = any(t.needs) and n.status <> 'done')
       and not exists (select 1 from tasks c where c.parent = t.id)`, [root.id]);
  const claims = await q(`select id, title, claimed_by, scope, claim_expires from tasks where root = $1 and ${LIVE}`, [root.id]);
  const decisions = await q(`select id, statement, by from decisions where root = $1 and status = 'active' order by at desc limit 10`, [root.id]);
  const open = (t) => !['done', 'archived'].includes(t.status);
  const kids = (t) => rows.filter((c) => c.parent === t.id);

  const attention = [
    ...rows.filter((t) => t.status === 'proposed').map((t) => `${t.id} proposed: **${t.title}** — accept (open) or decline (archived)`),
    ...rows.filter((t) => t.status === 'blocked').map((t) => `${t.id} blocked: **${t.title}**`),
    ...rows.filter((t) => t.status === 'open' && t.verdict).map((t) => `${t.id} came back: **${t.title}** — ${firstLine(t.verdict.trim().split('\n').pop())}`),
    ...rows.filter((t) => t.status === 'submitted').map((t) => `${t.id} submitted, but its checks never finished — submit it again to re-run them: **${t.title}**`),
    ...rows.filter((t) => t.status === 'verified').map((t) => `${t.id} verified, waiting for review: **${t.title}**`),
    ...rows.filter((t) => t.status === 'open' && kids(t).length && kids(t).every((c) => !open(c)))
      .map((t) => `${t.id} every child is done — is the goal reached? **${t.title}**`),
    ...rows.filter((t) => open(t) && t.decision_refs.some((d) => superseded.includes(d)))
      .map((t) => `${t.id} is bound by a superseded decision — re-plan: **${t.title}**`),
  ];
  const feedback = rows.filter((t) => open(t) && t.feedback);
  const done = rows.filter((t) => t.status === 'done').sort((a, b) => b.updated_at - a.updated_at).slice(0, 10);

  return [
    `# ${root.id} — ${root.title}  [${root.status}]\n`,
    section('Goal', root.goal),
    section('Needs attention', bullets(attention, (a) => a)),
    section('Feedback from the work', feedback.map((t) => `**${t.id} ${t.title}**\n${t.feedback}`).join('\n')),
    section('Tree', `\`\`\`\n${tree(rows)}\n\`\`\``),
    section('Ready to claim', bullets(ready, (t) => `${t.id} ${t.title}`)),
    section('Live claims', bullets(claims, (c) => `${c.id} ${c.claimed_by} — ${c.scope.join(', ') || 'no scope'}`)),
    section('Recently done — contradict what is not', bullets(done, (t) => `${t.id} **${t.title}** — ${firstLine(t.goal)}`)),
    section('Decisions in force', bullets(decisions, (d) => `${d.id}: ${d.statement} (${d.by})`)),
    section('How it is used', root.consumer_scenario),
    section('Plan', root.plan),
    section('Interview', root.interview),
  ].join('');
}
