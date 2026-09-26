// Who is calling, and for which project. Nothing here is authentication.

import { spawnSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { userInfo } from 'node:os';

// Where the work is. A harness may start the MCP server from the plugin's own folder,
// so its statement of the project directory wins over the process's.
export function workdir() {
  return process.env.IDLE_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// The repository's name, so every clone and worktree lands on the same tasks. Null outside one.
export function repository() {
  const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: workdir(), encoding: 'utf8' });
  return git.status === 0 && git.stdout.trim() ? basename(dirname(git.stdout.trim())) : null;
}

export function project() {
  return process.env.IDLE_PROJECT || repository() || basename(resolve(workdir()));
}

export function context(input = {}, fallbackBy) {
  return {
    by: input.by ?? process.env.IDLE_BY ?? fallbackBy ?? userInfo().username,
    project: input.project ?? project(),
  };
}
