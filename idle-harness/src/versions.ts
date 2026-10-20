// Versions of a harness folder. Git keeps them; the base drives it, and the agent commits nothing.

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// The user's own git setup has no say in here: not their config, identity, signing, hooks or ignores,
// and not a repository named in the environment.
const settings = ['user.name=idle-harness', 'user.email=idle-harness@localhost', 'commit.gpgsign=false', 'core.hooksPath=/dev/null', 'core.excludesFile=/dev/null', 'init.defaultBranch=main'];

function git(dir: string, ...args: string[]): string {
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const run = spawnSync('git', [...settings.flatMap((setting) => ['-c', setting]), ...args], { cwd: dir, encoding: 'utf8', env });
  if (run.status !== 0) throw new Error(`git ${args[0]}: ${(run.stderr || run.error?.message || '').trim()}`);
  return run.stdout.trim();
}

// A harness folder becomes a repository the first time it is used. Its first version is the empty folder.
export function init(dir: string) {
  if (existsSync(join(dir, '.git'))) return;
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  mkdirSync(join(dir, '.git', 'info'), { recursive: true });
  appendFileSync(join(dir, '.git', 'info', 'exclude'), '.sessions/\n'); // the base's records are not the harness
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'empty');
}

// Saves a version when the folder changed, and says which version the folder is at.
export function save(dir: string, why: string): string {
  if (git(dir, 'status', '--porcelain', '--untracked-files=all')) {
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', why);
  }
  return git(dir, 'rev-parse', '--short', 'HEAD');
}

export const list = (dir: string) => git(dir, 'log', '-n', '30', '--format=%h  %cd  %s', '--date=format:%Y-%m-%d %H:%M');

function known(version: string): string {
  if (!/^[0-9a-f]{4,40}$/.test(version ?? '')) throw new Error('name a version as the list shows it');
  return version;
}

export const show = (dir: string, version: string) => git(dir, 'show', '--stat', '--patch', '--format=%h  %cd  %s', known(version));

// Going back is itself a version, so nothing is ever lost.
export function restore(dir: string, version: string): string {
  save(dir, `before going back to ${known(version)}`);
  try {
    git(dir, 'restore', `--source=${version}`, '--staged', '--worktree', '--', '.');
  } catch (error: any) {
    if (!/did not match/.test(error.message)) throw error; // an empty folder going back to an empty version
  }
  return save(dir, `back to ${version}`);
}
