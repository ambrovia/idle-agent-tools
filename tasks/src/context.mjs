// Who is calling, and for which project. Nothing here is authentication.

import { spawnSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { userInfo } from 'node:os';

// The repository's name, so every clone and worktree lands on the same streams.
export function project() {
  if (process.env.IDLE_PROJECT) return process.env.IDLE_PROJECT;
  const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  if (git.status === 0 && git.stdout.trim()) return basename(dirname(git.stdout.trim()));
  return basename(resolve('.'));
}

export function context(input = {}, fallbackBy) {
  return {
    by: input.by ?? process.env.IDLE_BY ?? fallbackBy ?? userInfo().username,
    project: input.project ?? project(),
  };
}
