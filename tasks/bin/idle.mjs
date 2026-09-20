#!/usr/bin/env node
// CLI — generated from the operations list. One call, one transaction, exit.
// `idle mcp` serves the same operations over MCP on stdio.
// Exit codes: 0 ok, 1 refused (an expected "no"), 2 usage or failure.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Installed from a plugin checkout there is no node_modules yet; install once.
if (!existsSync(join(ROOT, 'node_modules', '@electric-sql', 'pglite'))) {
  process.stderr.write('idle: installing dependencies (first run only)…\n');
  const install = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: ['ignore', 2, 2] });
  if (install.status !== 0) { process.stderr.write('idle: npm install failed\n'); process.exit(2); }
}

const { OPS, Refused } = await import('../src/ops.mjs');
const { withTx } = await import('../src/store.mjs');
const { context } = await import('../src/context.mjs');

function help(op) {
  if (!op) {
    const width = Math.max(...OPS.map((o) => o.name.length));
    return `idle <operation> [args] [--flags]\n\n${OPS.map((o) => `  ${o.name.padEnd(width)}  ${o.summary}`).join('\n')}\n\n` +
      'Global: --by <who>  --project <label>   (or IDLE_BY, IDLE_PROJECT)\nidle help <operation> for its arguments.   idle mcp serves these over MCP (stdio).';
  }
  const flags = Object.entries(op.flags ?? {}).map(([name, f]) => `  --${name}${f.type === 'bool' ? '' : ` <${f.type}>`}  ${f.desc ?? ''}`);
  return `idle ${op.name} ${(op.args ?? []).map((a) => `<${a}>`).join(' ')}\n\n${op.summary}\n${flags.length ? `\n${flags.join('\n')}` : ''}`;
}

function parse(op, argv) {
  const flags = { ...(op.flags ?? {}), by: { type: 'string' }, project: { type: 'string' } };
  const input = {}; const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const name = arg.slice(2); const flag = flags[name];
    if (!flag) throw new Error(`unknown flag --${name}`);
    if (flag.type === 'bool') { input[name] = true; continue; }
    const value = argv[++i];
    if (value === undefined) throw new Error(`--${name} needs a value`);
    if (flag.type === 'list') (input[name] ??= []).push(value);
    else input[name] = flag.type === 'json' ? JSON.parse(value) : value;
  }
  const names = op.args ?? [];
  if (positional.length !== names.length) throw new Error(`expected ${names.map((a) => `<${a}>`).join(' ') || 'no arguments'}`);
  names.forEach((name, i) => { input[name] = positional[i]; });
  return input;
}

const [name, ...rest] = process.argv.slice(2);
if (!name || name === 'help' || name === '--help') {
  console.log(help(OPS.find((o) => o.name === rest[0])));
  process.exit(0);
}
if (name === 'mcp') {
  (await import('../src/mcp.mjs')).serve();
  await new Promise(() => {}); // until the harness closes stdin
}
const op = OPS.find((o) => o.name === name);
if (!op) { console.error(`unknown operation "${name}"\n\n${help()}`); process.exit(2); }

try {
  const input = parse(op, rest);
  const result = await withTx((q) => op.run(q, input, context(input)));
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
} catch (err) {
  if (err instanceof Refused) { console.error(`refused: ${err.message}`); process.exit(1); }
  // A CHECK constraint is the database refusing an essay.
  if (err.code === '23514') { console.error(`refused: too long or not allowed (${err.constraint ?? err.message})`); process.exit(1); }
  console.error(`${err.message}\n\n${help(op)}`);
  process.exit(2);
}
