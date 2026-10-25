import { before, after, test } from 'node:test';
import { Pool } from 'pg';
import * as store from '../src/projects/store-postgres.js';
import { scenario } from './v2-runtime-fixture.js';
export async function postgresWorkerContracts(register) {
  const url = process.env.TEST_PG_URL ?? 'postgres://postgres:probe@127.0.0.1:5544/postgres';
  const maintenance = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
  try { await maintenance.query('SELECT 1'); }
  catch { await maintenance.end(); test('PostgreSQL worker checks unexecuted', t => t.skip('owned isolated PostgreSQL required')); return; }
  const database = `forge_8i2_${crypto.randomUUID().replaceAll('-', '')}`, previous = process.env.FORGE_PROJECTS_DATABASE_URL;
  before(async () => { await maintenance.query(`CREATE DATABASE "${database}"`); process.env.FORGE_PROJECTS_DATABASE_URL = url.replace(/\/[^/]*$/, `/${database}`); });
  after(async () => { await store.closeProjectStore(); if (previous === undefined) delete process.env.FORGE_PROJECTS_DATABASE_URL;
    else process.env.FORGE_PROJECTS_DATABASE_URL = previous;
    await maintenance.query(`DROP DATABASE "${database}"`); await maintenance.end(); });
  register('PostgreSQL', t => scenario(t, store));
}
