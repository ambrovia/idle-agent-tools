const ENDPOINT = 'https://api.linear.app/graphql';
export const META_URL = 'https://idle.invalid/';

export function graphqlClient(apiKey) {
  async function gql(query, variables = {}) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: apiKey },
      body: JSON.stringify({ query, variables }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.errors?.length) throw new Error(`Linear: ${body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`}`);
    return body.data;
  }

  return {
    async team(keyOrName) {
      const data = await gql(`query($v: String!) {
        teams(first: 1, filter: { or: [{ key: { eq: $v } }, { name: { eq: $v } }] }) {
          nodes { id states { nodes { id name type position } } labels(first: 250) { nodes { id name } } }
        }
      }`, { v: keyOrName });
      const team = data.teams.nodes[0];
      if (!team) throw new Error(`Linear: no team "${keyOrName}"`);
      return { id: team.id, states: team.states.nodes, labels: team.labels.nodes };
    },
    async project(teamId, name) {
      const data = await gql(`query($id: String!, $name: String!) { team(id: $id) { projects(first: 1, filter: { name: { eq: $name } }) { nodes { id } } } }`, { id: teamId, name });
      return data.team.projects.nodes[0] ?? null;
    },
    async createProject(name, teamId) {
      const data = await gql(`mutation($name: String!, $teamId: String!) {
        projectCreate(input: { name: $name, teamIds: [$teamId] }) { project { id name } }
      }`, { name, teamId });
      return data.projectCreate.project;
    },
    async createLabel(teamId, name) {
      const data = await gql(`mutation($name: String!, $teamId: String!) {
        issueLabelCreate(input: { name: $name, teamId: $teamId }) { issueLabel { id name } }
      }`, { name, teamId });
      return data.issueLabelCreate.issueLabel;
    },
    async issues(teamId, projectId) {
      const all = [];
      for (let after = null; ;) {
        const data = await gql(`query($teamId: ID!, $projectId: ID!, $after: String) {
          issues(first: 50, after: $after, includeArchived: true, filter: { team: { id: { eq: $teamId } }, project: { id: { eq: $projectId } } }) {
            nodes {
              id identifier title description createdAt updatedAt trashed
              parent { id } state { id } project { id } labels { nodes { id } }
              attachments { nodes { url metadata } }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`, { teamId, projectId, after });
        for (const i of data.issues.nodes.filter((n) => !n.trashed)) {
          all.push({
            id: i.id, identifier: i.identifier, title: i.title, description: i.description ?? '',
            parentId: i.parent?.id ?? null, stateId: i.state?.id ?? null, projectId: i.project?.id ?? null,
            labelIds: i.labels.nodes.map((l) => l.id), createdAt: i.createdAt, updatedAt: i.updatedAt,
            meta: i.attachments.nodes.find((a) => a.url?.startsWith(META_URL))?.metadata ?? null,
          });
        }
        if (!data.issues.pageInfo.hasNextPage) return all;
        after = data.issues.pageInfo.endCursor;
      }
    },
    async createIssue(input) {
      const data = await gql(`mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) { issue { id identifier createdAt updatedAt } }
      }`, { input });
      return data.issueCreate.issue;
    },
    async updateIssue(id, input) {
      await gql(`mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`, { id, input });
    },
    async saveAttachment({ issueId, url, title, metadata }) {
      await gql(`mutation($input: AttachmentCreateInput!) { attachmentCreate(input: $input) { success } }`,
        { input: { issueId, url, title, metadata } });
    },
    async blocks(blockerId, blockedId) {
      await gql(`mutation($input: IssueRelationCreateInput!) { issueRelationCreate(input: $input) { success } }`,
        { input: { issueId: blockerId, relatedIssueId: blockedId, type: 'blocks' } });
    },
  };
}
