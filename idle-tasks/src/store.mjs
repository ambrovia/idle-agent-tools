import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { workdir } from './context.mjs';
import { records } from './records.mjs';

export function home() {
  return process.env.IDLE_HOME || join(homedir(), '.idle');
}

export function config() {
  const file = join(home(), 'config.json');
  const cfg = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const repo = repoSetting();
  if (repo.backend) cfg.backend = repo.backend;
  if (repo.linear) cfg.linear = { ...cfg.linear, team: repo.linear.team, project: repo.linear.project };
  if (process.env.IDLE_DATABASE_URL) cfg.database = process.env.IDLE_DATABASE_URL;
  return cfg;
}

let setting;
function repoSetting() {
  if (!setting) {
    const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: workdir(), encoding: 'utf8' }).stdout?.trim();
    const file = top && join(top, '.idle.json');
    setting = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  }
  return setting;
}

// The shell commands that verify a project's work — configured on this machine,
// never taken from a task: { "checks": { "<project>": ["npm run verify"] } }.
export function checksFor(project) {
  const checks = config().checks ?? {};
  return Object.hasOwn(checks, project) && Array.isArray(checks[project]) ? checks[project] : [];
}

export function mode() {
  const cfg = config();
  return cfg.backend === 'linear' ? 'linear' : cfg.database ? 'shared' : 'local';
}

export async function withStore(fn) {
  const storage = await import(config().backend === 'linear' ? './linear.mjs' : './sql.mjs');
  return storage.withData((data) => fn(records(data)));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

// @lore: PGlite — two processes on one dir fork data silently, both win a claim; lock required; nothing slow under it; freed by dead pid or 10 min age (sleep-safe, recycled-pid-safe)
const STALE_MS = 10 * 60_000;

async function acquire(lock) {
  const owner = join(lock, 'pid');
  let orphaned = 0; // how long the lock has existed without a readable pid
  for (;;) {
    try {
      mkdirSync(lock);
      writeFileSync(owner, String(process.pid));
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    // The owner may release between any two of these calls; a missing file is not an error.
    let pid = 0; let age = 0;
    try { pid = Number(readFileSync(owner, 'utf8')) || 0; age = Date.now() - statSync(owner).mtimeMs; } catch { /* not written yet, or just released */ }
    orphaned = pid ? 0 : orphaned + 25;
    if ((pid && !alive(pid)) || age > STALE_MS || orphaned > 2000) {
      // Rename is atomic: of several stealers exactly one takes the stale lock away;
      // the others fail here and go back to waiting for the fresh one.
      const grave = `${lock}.stale.${process.pid}`;
      try { renameSync(lock, grave); rmSync(grave, { recursive: true, force: true }); } catch { /* someone else stole it */ }
    } else {
      await sleep(25);
    }
  }
}

// One process at a time on this machine, for whatever fn does with the data in home().
export async function withLock(fn) {
  mkdirSync(home(), { recursive: true });
  const lock = join(home(), 'db.lock');
  await acquire(lock);
  try {
    return await fn();
  } finally {
    // Release only what is still ours: if we were robbed, the lock now belongs to someone else.
    let holder = 0;
    try { holder = Number(readFileSync(join(lock, 'pid'), 'utf8')); } catch { /* already gone */ }
    if (holder === process.pid) rmSync(lock, { recursive: true, force: true });
  }
}
