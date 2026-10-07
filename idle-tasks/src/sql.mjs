import { join } from 'node:path';
import { config, home, withLock } from './store.mjs';
import { migrate } from './schema.mjs';

export async function withData(fn) {
  return (config().database ? shared : local)(async (q) => {
    await q(`select pg_advisory_xact_lock(hashtext('idle'))`);
    const data = { tasks: await q('select * from tasks'), decisions: await q('select * from decisions') };
    const result = await fn(data);
    const rows = [...data.dirty];
    await upsert(q, 'tasks', rows.filter((r) => !('statement' in r)));
    await upsert(q, 'decisions', rows.filter((r) => 'statement' in r));
    return result;
  });
}

async function upsert(q, table, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  await q(`insert into ${table} select * from json_populate_recordset(null::${table}, $1)
    on conflict (id) do update set (${columns.map((c) => `"${c}"`)}) = row(${columns.map((c) => `excluded."${c}"`)})`, [JSON.stringify(rows)]);
}

async function local(fn) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  return withLock(async () => {
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
    }
  });
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
