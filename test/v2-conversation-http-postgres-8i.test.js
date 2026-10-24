import { before, after, test } from 'node:test';
import { Pool } from 'pg';
import * as store from '../src/projects/store-postgres.js';
import { conversationHttpContract, conversationHttpFixture } from './v2-conversation-http-contract.js';
process.env.FORGE_HOSTED = '1';
const url = process.env.TEST_PG_URL ?? 'postgres://postgres:probe@127.0.0.1:5544/postgres';
const maintenance = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
let available = false;
try { await maintenance.query('SELECT 1'); available = true; } catch { await maintenance.end(); }
if (!available) {
  test('PostgreSQL conversation HTTP contracts unexecuted', t => t.skip('owned isolated PostgreSQL required'));
} else {
  const database = `forge_8i_http_${crypto.randomUUID().replaceAll('-', '')}`;
  const destination = new URL(url); destination.pathname = '/' + database;
  const previous = process.env.FORGE_PROJECTS_DATABASE_URL;
  before(async () => { await maintenance.query(`CREATE DATABASE "${database}"`); process.env.FORGE_PROJECTS_DATABASE_URL = destination.href; });
  after(async () => {
    await store.closeProjectStore();
    await maintenance.query(`DROP DATABASE "${database}"`); await maintenance.end();
    if (previous === undefined) delete process.env.FORGE_PROJECTS_DATABASE_URL; else process.env.FORGE_PROJECTS_DATABASE_URL = previous;
  });
  conversationHttpContract('PostgreSQL', (t, env) => conversationHttpFixture(t, store, {
    FORGE_PROJECTS_BACKEND: 'postgres', FORGE_PROJECTS_DATABASE_URL: destination.href,
    ...env,
  }));
}
