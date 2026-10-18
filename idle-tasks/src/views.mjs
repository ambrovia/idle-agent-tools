// Views — markdown for a cold reader. The brief is what a worker starts from;
// the state is what the planner and the human read before the next move.

import { checksFor } from './store.mjs';

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

const kindTag = (m) => (m.kind && m.kind !== 'decision' ? ` [${m.kind}]` : '');
const rejectedTag = (m) => (m.rejected?.length ? ` (rejected: ${m.rejected.join(', ')})` : '');
const formatBriefMemory = (m) => `${m.id}${kindTag(m)}: ${m.summary}${m.details ? ` — ${firstLine(m.details)}` : ''}${rejectedTag(m)}`;
const formatStateMemory = (m) => `${m.id}${kindTag(m)}: ${m.summary}${rejectedTag(m)} (${m.by})`;

export async function brief(s, task) {
  const line = await s.lineage(task.id); // root first, the task itself last
  const root = line[0];
  const ancestors = line.slice(0, -1);
  const planned = [...line].reverse().find((t) => t.plan);
  const interviewed = [...line].reverse().find((t) => t.interview);
  const refs = [...new Set(line.flatMap((t) => t.memory_refs))];
  const memories = (await s.memories(refs)).filter((m) => m.status === 'active' && m.kind !== 'retro');
  const projectMemory = (await s.projectMemories(task.project)).filter((m) => m.status === 'active' && m.kind !== 'retro').reverse();
  const needs = await s.tasks(task.needs);
  const where = Object.assign({}, ...line.map((t) => t.metadata)); // root first, so a task's own entries win
  return [
    // Stable project and root context first (maximises prompt-cache prefix hits across spawns and retries).
    section('What this is for', bullets(ancestors, (t) => `**${t.title}** — ${firstLine(t.goal)}`)),
    section('How it is used', root.consumer_scenario),
    section(`Plan${planned && planned.id !== task.id ? ` (from ${planned.id})` : ''}`, planned?.plan),
    section(`Interview${interviewed && interviewed.id !== task.id ? ` (from ${interviewed.id})` : ''}`, interviewed?.interview),
    section('Project memory', bullets(projectMemory, formatBriefMemory)),
    section('Decisions in force', bullets(memories, formatBriefMemory)),
    section('Checks — the system runs these when you submit', bullets(checksFor(task.project), (c) => `\`${c}\``)),
    section('Where', Object.keys(where).length ? `\`${JSON.stringify(where)}\`` : ''),
    // Task-specific and retry-volatile context last.
    `\n# ${task.id} — ${task.title}  [${task.status}]\n`,
    section('Goal', task.goal || '_No goal written. Ask before guessing._'),
    section('Signs the goal is reached', task.acceptance_criteria),
    section('Scope', bullets(task.scope, (s) => `\`${s}\``)),
    section('Builds on', bullets(needs, (n) => `${n.id} [${n.status}] **${n.title}** — ${firstLine(n.goal)}`)),
    section('Why it came back', task.verdict),
    '\nThe goal is the contract; the signs and the checks only help you tell. Done means the goal is reached.\n',
  ].join('').trimStart();
}

export async function state(s, root) {
  const rows = await s.treeRows(root.id);
  const made = await s.memoriesInRoot(root.id); // newest first
  const proj = await s.projectMemories(root.project); // newest first
  const superseded = [...made, ...proj].filter((m) => m.status === 'superseded').map((m) => m.id);
  const ready = await s.ready({ root: root.id });
  const claims = await s.liveClaims(root.id);
  const memories = made.filter((m) => m.status === 'active' && m.kind !== 'retro').slice(0, 10);
  const retros = made.filter((m) => m.status === 'active' && m.kind === 'retro');
  const projectMemory = proj.filter((m) => m.status === 'active' && m.kind !== 'retro').slice(0, 20);
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
    ...rows.filter((t) => open(t) && t.memory_refs.some((m) => superseded.includes(m)))
      .map((t) => `${t.id} is bound by a superseded memory — re-plan: **${t.title}**`),
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
    section('Project memory', bullets(projectMemory, formatStateMemory)),
    section('Decisions in force', bullets(memories, formatStateMemory)),
    section('How it is used', root.consumer_scenario),
    section('Plan', root.plan),
    section('Interview', root.interview),
    section('Retro', bullets(retros, formatBriefMemory)),
    section('Outcome', root.outcome),
  ].join('');
}
