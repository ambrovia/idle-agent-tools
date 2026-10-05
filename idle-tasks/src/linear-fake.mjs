// A Linear workspace in a JSON file, answering the calls linear-client.mjs makes. For tests:
// IDLE_LINEAR_FAKE=<file> runs the Linear backend without a network or an API key.
// Only one process touches it at a time — linear.mjs holds the machine's lock around every call.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const STATES = [
  ['Triage', 'triage'], ['Backlog', 'backlog'], ['Todo', 'unstarted'], ['In Progress', 'started'],
  ['In Review', 'started'], ['Done', 'completed'], ['Canceled', 'canceled'],
];

export function fakeClient(file) {
  const read = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
  const write = (ws) => { writeFileSync(`${file}.tmp`, JSON.stringify(ws, null, 1)); renameSync(`${file}.tmp`, file); };
  const workspace = () => read() ?? { teams: [], projects: [], labels: [], issues: [], relations: [], clock: 0 };
  // Linear stamps every write; strictly increasing here so ordering by time is never a tie.
  const stamp = (ws) => { ws.clock = Math.max(Date.now(), ws.clock + 1); return new Date(ws.clock).toISOString(); };
  const change = (fn) => { const ws = workspace(); const out = fn(ws); write(ws); return out; };

  return {
    async team(key) {
      return change((ws) => {
        let team = ws.teams.find((t) => t.key === key || t.name === key);
        if (!team) {
          team = { id: randomUUID(), key, name: key, states: STATES.map(([name, type], position) => ({ id: randomUUID(), name, type, position })) };
          ws.teams.push(team);
        }
        return { id: team.id, states: team.states, labels: ws.labels.filter((l) => l.teamId === team.id) };
      });
    },
    async projects(teamId) { return workspace().projects.filter((p) => p.teamId === teamId).map(({ id, name }) => ({ id, name })); },
    async createProject(name, teamId) { return change((ws) => { const p = { id: randomUUID(), name, teamId }; ws.projects.push(p); return { id: p.id, name }; }); },
    async createLabel(teamId, name) { return change((ws) => { const l = { id: randomUUID(), name, teamId }; ws.labels.push(l); return { id: l.id, name }; }); },
    async issues(teamId, projectId) {
      const ws = workspace();
      const team = ws.teams.find((t) => t.id === teamId);
      return ws.issues.filter((i) => i.teamId === teamId && i.projectId === projectId).map((i) => ({
        ...i, meta: i.attachments.find((a) => a.url.startsWith('https://idle.invalid/'))?.metadata ?? null, key: team.key,
      }));
    },
    async createIssue({ teamId, projectId, title, description, parentId = null, stateId, labelIds = [] }) {
      return change((ws) => {
        const team = ws.teams.find((t) => t.id === teamId);
        team.counter = (team.counter ?? 0) + 1;
        const at = stamp(ws);
        const issue = { id: randomUUID(), identifier: `${team.key}-${team.counter}`, teamId, projectId, title, description, parentId, stateId, labelIds, createdAt: at, updatedAt: at, attachments: [] };
        ws.issues.push(issue);
        return { id: issue.id, identifier: issue.identifier, createdAt: at, updatedAt: at };
      });
    },
    async updateIssue(id, input) {
      change((ws) => { const issue = ws.issues.find((i) => i.id === id); Object.assign(issue, input, { updatedAt: stamp(ws) }); });
    },
    async saveAttachment({ issueId, url, title, metadata }) {
      change((ws) => {
        const issue = ws.issues.find((i) => i.id === issueId);
        const existing = issue.attachments.find((a) => a.url === url);
        if (existing) Object.assign(existing, { title, metadata }); else issue.attachments.push({ url, title, metadata });
        issue.updatedAt = stamp(ws);
      });
    },
    async blocks(blockerId, blockedId) { change((ws) => { ws.relations.push({ type: 'blocks', issueId: blockerId, relatedIssueId: blockedId }); }); },
  };
}
