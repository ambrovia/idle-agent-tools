// Storage — one verb: run a function inside a transaction.
// Local: PGlite in the user's home, one process at a time, so every call is
// lock → open → transaction → close. Shared: any Postgres the config names.
// Same SQL either way.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { migrate } from './schema.mjs';

export function home() {
  return process.env.IDLE_HOME || join(homedir(), '.idle');
}

export function config() {
  const file = join(home(), 'config.json');
  const cfg = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  if (process.env.IDLE_DATABASE_URL) cfg.database = process.env.IDLE_DATABASE_URL;
  return cfg;
}

export function mode() {
  return config().database ? 'shared' : 'local';
}

// fn receives q(sql, params) → rows.
export async function withTx(fn) {
  return config().database ? shared(fn) : local(fn);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

// @lore: PGlite forks the data silently when two processes open one directory —
// both "win" the same claim. The lock is what makes local mode correct.
async function acquire(lock) {
  const owner = join(lock, 'pid');
  for (let waited = 0; ; waited += 25) {
    try {
      mkdirSync(lock);
      writeFileSync(owner, String(process.pid));
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const pid = existsSync(owner) ? Number(readFileSync(owner, 'utf8')) : 0;
      // Steal from a dead owner; a lock with no pid yet gets a second to write one.
      if ((pid && !alive(pid)) || (!pid && waited > 1000)) rmSync(lock, { recursive: true, force: true });
      else await sleep(25);
    }
  }
}

async function local(fn) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  mkdirSync(home(), { recursive: true });
  const lock = join(home(), 'db.lock');
  await acquire(lock);
  let db;
  try {
    db = new PGlite(join(home(), 'db'), { extensions: { pg_trgm } });
    return await db.transaction(async (tx) => {
      const q = async (sql, params = []) => (await tx.query(sql, params)).rows;
      await migrate(q);
      return fn(q);
    });
  } finally {
    if (db) await db.close().catch(() => {});
    rmSync(lock, { recursive: true, force: true });
  }
}

async function shared(fn) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: config().database });
  await client.connect();
  const q = async (sql, params = []) => (await client.query(sql, params)).rows;
  try {
    await q('begin');
    await migrate(q);
    const result = await fn(q);
    await q('commit');
    return result;
  } catch (err) {
    await q('rollback').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}
