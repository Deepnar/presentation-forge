import { before, after, test } from 'node:test';
import { Pool } from 'pg';
import * as store from '../src/projects/store-postgres.js';
import { scenario } from './v2-runtime-fixture.js';
import { turnProcessContract } from './v2-turns-process-contract.js';
import { turnContract, recoveryContract, boundsContract, admissionContract, settlementContract, unicodeContract, cancellationContract } from './v2-turns-contract.js';
const url = process.env.TEST_PG_URL ?? 'postgres://postgres:probe@127.0.0.1:5544/postgres';
const maintenance = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
let available = false, readinessCode = 'unknown';
try { await maintenance.query('SELECT 1'); available = true; } catch (error) {
  if (typeof error?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code)) readinessCode = error.code;
}
if (!available) {
  await maintenance.end();
  test('PostgreSQL unavailable; durable turn contracts unexecuted', t => { t.diagnostic(`readiness stage=SELECT1 code=${readinessCode}`); t.skip('isolated PostgreSQL required'); });
} else {
  const database = `forge_8h_${crypto.randomUUID().replaceAll('-', '')}`, previous = process.env.FORGE_PROJECTS_DATABASE_URL;
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
  turnContract('PostgreSQL', t => scenario(t, store));
  recoveryContract('PostgreSQL', t => scenario(t, store));
  boundsContract('PostgreSQL', t => scenario(t, store));
  admissionContract('PostgreSQL', t => scenario(t, store));
  settlementContract('PostgreSQL', t => scenario(t, store));
  unicodeContract('PostgreSQL', t => scenario(t, store));
  cancellationContract('PostgreSQL', t => scenario(t, store));
  turnProcessContract('PostgreSQL', t => scenario(t, store));
}
