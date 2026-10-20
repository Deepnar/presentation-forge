import { before, after, test } from 'node:test';
import { Pool } from 'pg';
import * as store from '../src/projects/store-postgres.js';
import { scenario } from './v2-runtime-fixture.js';
import { providerRunContract } from './v2-provider-run-contract.js';
const url = process.env.TEST_PG_URL ?? 'postgres://postgres:probe@127.0.0.1:5544/postgres';
const maintenance = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
let available = false;
try { await maintenance.query('SELECT 1'); available = true; } catch {}
if (!available) {
  await maintenance.end();
  test('PostgreSQL unavailable; provider-run contracts unexecuted', t => t.skip('isolated PostgreSQL required'));
} else {
  const database = `forge_8d_${crypto.randomUUID().replaceAll('-', '')}`, previous = process.env.FORGE_PROJECTS_DATABASE_URL;
  before(async () => {
    await maintenance.query(`CREATE DATABASE "${database}"`);
    process.env.FORGE_PROJECTS_DATABASE_URL = url.replace(/\/[^/]*$/, `/${database}`);
  });
  after(async () => {
    await store.closeProjectStore();
    if (previous === undefined) delete process.env.FORGE_PROJECTS_DATABASE_URL;
    else process.env.FORGE_PROJECTS_DATABASE_URL = previous;
    await maintenance.query(`DROP DATABASE "${database}"`); await maintenance.end();
  });
  providerRunContract('PostgreSQL', t => scenario(t, store));
}
