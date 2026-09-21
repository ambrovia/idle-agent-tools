// MCP server over stdio — the same operations list the CLI is generated from.
// Newline-delimited JSON-RPC. It holds no database open between calls: each tool
// call is one transaction, exactly like one CLI call.

import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPS, Refused, runOp } from './ops.mjs';
import { context, workdir } from './context.mjs';

const OWN_FOLDER = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

const TYPES = {
  string: { type: 'string' },
  bool: { type: 'boolean' },
  list: { type: 'array', items: { type: 'string' } },
  json: { type: 'object' },
};

const tools = OPS.filter((op) => !op.cliOnly).map((op) => ({
  name: op.name,
  description: op.summary,
  inputSchema: {
    type: 'object',
    properties: {
      ...Object.fromEntries((op.args ?? []).map((arg) => [arg, { type: 'string' }])),
      ...Object.fromEntries(Object.entries(op.flags ?? {}).map(([name, f]) => [name, { ...TYPES[f.type], description: f.desc }])),
      by: { type: 'string', description: 'who you are, e.g. harness/model — recorded on claims, feedback and decisions' },
      project: { type: 'string', description: 'project label; leave out — it is taken from the repository you are working in' },
    },
    required: op.args ?? [],
  },
}));

export function serve() {
  const session = randomBytes(3).toString('hex');
  let client = 'mcp';
  let roots = false;
  const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  const text = (body, isError = false) => ({ content: [{ type: 'text', text: body }], isError });

  async function call({ name, arguments: input = {} }) {
    const op = tools.find((t) => t.name === name) && OPS.find((o) => o.name === name);
    if (!op) return text(`unknown operation "${name}"`, true);
    // Started from our own install folder and never told where the work is: do not guess a project.
    if (!input.project && !process.env.IDLE_PROJECT && resolve(workdir()) === OWN_FOLDER) {
      return text('refused: cannot tell which project you are working in — pass project (the repository name)', true);
    }
    try {
      const result = await runOp(op, input, context(input, `${client}/${session}`));
      return text(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    } catch (err) {
      if (err instanceof Refused) return text(`refused: ${err.message}`, true);
      if (err.code === '23514') return text(`refused: too long or not allowed (${err.constraint ?? err.message})`, true);
      return text(`failed: ${err.message}`, true);
    }
  }

  const pending = new Set();
  const lines = createInterface({ input: process.stdin });
  // The harness closing stdin is the end of the session; finish what is in flight first.
  lines.on('close', async () => { await Promise.allSettled(pending); process.exit(0); });
  lines.on('line', (line) => {
    const work = handle(line).finally(() => pending.delete(work));
    pending.add(work);
  });

  async function handle(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const { id, method, params } = message;
    if (id === 'roots' && !method) {
      // A harness may start us from the plugin's folder; the workspace root it names is where the work is.
      const uri = message.result?.roots?.[0]?.uri;
      if (uri?.startsWith('file://') && !process.env.IDLE_PROJECT_DIR && !process.env.CLAUDE_PROJECT_DIR) process.env.IDLE_PROJECT_DIR = fileURLToPath(uri);
      return;
    }
    if (method === 'notifications/initialized' && roots) send({ id: 'roots', method: 'roots/list' });
    if (id === undefined) return; // any other notification: nothing to answer
    if (method === 'initialize') {
      client = params?.clientInfo?.name ?? client;
      roots = !!params?.capabilities?.roots;
      send({ id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'idle', version: '0.0.1' } } });
    } else if (method === 'ping') send({ id, result: {} });
    else if (method === 'tools/list') send({ id, result: { tools } });
    else if (method === 'tools/call') send({ id, result: await call(params) });
    else send({ id, error: { code: -32601, message: `method not found: ${method}` } });
  }
}
