// Everything lives in user space, next to idle-tasks: one folder per harness with its sessions inside it, and the
// user's own settings in the config.json idle-tasks reads too. Only the harness folders are versioned.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const idle = () => process.env.IDLE_HOME || join(homedir(), '.idle');
export const harnessDir = (name: string) => join(idle(), 'harness', name);
export const sessionDir = (name: string, session: string) => join(harnessDir(name), '.sessions', session);

// The user's settings for every harness: { "openrouter": { "apiKey" }, "harness": { "model", "contextLimit" } }.
// A config.json that cannot be read counts as none.
export function user(): { openrouter?: { apiKey?: string }; harness?: { model?: string; contextLimit?: number } } {
  try { return JSON.parse(readFileSync(join(idle(), 'config.json'), 'utf8')); } catch { return {}; }
}
