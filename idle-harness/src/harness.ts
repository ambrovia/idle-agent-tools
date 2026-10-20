// A harness folder at one version: its own turn, its own tools, its settings. All of it is loaded again
// when the folder is at a new version.

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KEPT } from './tools.ts';
import type { Tool } from './tools.ts';
import type { Turn } from './turn.ts';

// Node keeps the first copy of every file it imports. A harness's files carry the folder's version instead,
// so a new version loads all of them again, not just the file named first.
let loading = { root: '', version: '' };
registerHooks({
  resolve(specifier, context, next) {
    const found = next(specifier, context);
    const ours = loading.root && found.url.startsWith(loading.root) && !found.url.includes('?') && !found.url.includes('/node_modules/');
    return ours ? { ...found, url: `${found.url}?v=${loading.version}` } : found;
  },
});

async function load(dir: string, version: string, file: string) {
  loading = { root: pathToFileURL(`${realpathSync(dir)}/`).href, version };
  return import(pathToFileURL(join(dir, file)).href);
}

// The harness's own turn, or null for the plain one. Throws when turn.ts cannot be used.
export async function turn(dir: string, version: string): Promise<Turn | null> {
  if (!existsSync(join(dir, 'turn.ts'))) return null;
  const { turn } = await load(dir, version, 'turn.ts');
  if (typeof turn !== 'function') throw new Error('turn.ts exports no function named turn');
  return turn;
}

// The harness's own tools, one per file in tools/. A file that cannot be used is left out, with the reason.
export async function tools(dir: string, version: string): Promise<{ tools: Tool[]; problems: string[] }> {
  const found: Tool[] = [];
  const problems: string[] = [];
  let files: string[] = [];
  try { files = existsSync(join(dir, 'tools')) ? readdirSync(join(dir, 'tools')).filter((file) => file.endsWith('.ts')).sort() : []; } catch (error: any) { problems.push(`tools/: ${error.message}`); }
  for (const file of files) {
    const name = file.slice(0, -'.ts'.length);
    try {
      if (!/^[\w-]{1,64}$/.test(name)) throw new Error('a tool name is letters, digits, _ and -, at most 64');
      if (KEPT.has(name)) throw new Error(`${name} is the base's and stays so`);
      const { description, parameters, run } = await load(dir, version, join('tools', file));
      if (typeof description !== 'string' || typeof parameters !== 'object' || typeof run !== 'function') throw new Error('it must export description, parameters and run');
      found.push({ spec: { type: 'function', function: { name, description, parameters } }, run });
    } catch (error: any) {
      problems.push(`tools/${file}: ${error?.message ?? error}`);
    }
  }
  return { tools: found, problems };
}

// What the harness has set for itself. A config.json that cannot be read counts as none.
export function settings(dir: string): { model?: string; contextLimit?: number } {
  try { return JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')); } catch { return {}; }
}
