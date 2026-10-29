import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import * as store from '../../../src/projects/store-postgres.js';
import { createSourceRegistry } from '../../../src/projects/sources.js';
import { createProjectCopier } from '../../../src/projects/copy.js';
import { refuse } from '../../../src/projects/source-read.js';
import { seed } from '../../../test/v2-tool-fixture.js';
import { source } from '../../../test/v2-source-registry-fixture.js';
import { record } from '../../../test/v2-citations-fixture.js';

const maintenance = new Pool({ connectionString: process.env.FORGE_J5_REVIEW_PG_URL, connectionTimeoutMillis: 3000 });
const database = 'forge_copy_j5_review_' + process.pid + '_' + Date.now().toString(36);
const previous = process.env.FORGE_PROJECTS_DATABASE_URL;
const cleanup = { database, created: false, poolsClosed: false, dropped: false };
const userCatalog = async () => (await maintenance.query("SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY datname")).rows;
before(async () => {
  cleanup.serverVersion = (await maintenance.query('SHOW server_version')).rows[0].server_version;
  cleanup.initialUserCatalog = await userCatalog();
  assert.deepEqual(cleanup.initialUserCatalog, []);
  await maintenance.query(`CREATE DATABASE "${database}"`); cleanup.created = true;
  const url = new URL(process.env.FORGE_J5_REVIEW_PG_URL); url.pathname = '/' + database;
  process.env.FORGE_PROJECTS_DATABASE_URL = url.href;
  await store.__testReset();
});
after(async () => {
  try {
    await store.closeProjectStore(); cleanup.poolsClosed = true;
    if (previous === undefined) delete process.env.FORGE_PROJECTS_DATABASE_URL;
    else process.env.FORGE_PROJECTS_DATABASE_URL = previous;
    if (cleanup.created) { await maintenance.query(`DROP DATABASE "${database}"`); cleanup.dropped = true; }
    cleanup.finalUserCatalog = await userCatalog();
    assert.deepEqual(cleanup.finalUserCatalog, []);
  } finally {
    await maintenance.end(); cleanup.maintenanceClosed = true;
    await writeFile(new URL('./database-cleanup.json', import.meta.url), JSON.stringify(cleanup, null, 2) + '\n');
  }
});
async function fixture() {
  const { doc } = await store.createProject({ owner: 'review-owner', title: 'Independent copy fixture', scenes: seed() });
  const binding = { id: doc.id, owner: 'review-owner' }, registry = createSourceRegistry(store), retained = source(doc.id);
  assert.equal((await registry.register(binding, { projectRevision: 0, generation: 0, revision: 0, sources: [retained] })).ok, true);
  const scenes = seed();
  scenes[0].citations = [record(1, { source: { projectId: doc.id, id: retained.id, generation: 0 } })];
  return { binding, registry, input: { title: 'Independent live copy', scenes } };
}
async function counts() {
  const rows = await store.__testQuery('SELECT (SELECT count(*) FROM v2_projects) AS projects, (SELECT count(*) FROM v2_project_revisions) AS history, (SELECT count(*) FROM v2_project_source_catalog) AS catalogs, (SELECT count(*) FROM v2_project_sources) AS sources');
  return rows.rows;
}
test('private refusal after actual destination/catalog insertion rolls back and keeps its intentional code', { timeout: 10000 }, async () => {
  const e = await fixture(), original = (await store.getProject(e.binding)).doc, beforeCounts = await counts();
  let inserted = false, catalogWritten = false;
  const backend = { withCopyTransaction: (binding, job) => store.withCopyTransaction(binding, tx => job({ ...tx,
    insertCopy: async project => { await tx.insertCopy(project); inserted = true; },
    query: async (sql, params) => {
      const result = await tx.query(sql, params);
      if (sql.startsWith('INSERT INTO v2_project_source_catalog')) { catalogWritten = true; refuse('stale-catalog'); }
      return result;
    },
  })) };
  const result = await createProjectCopier(backend).copy(e.binding, e.input);
  assert.equal(inserted, true); assert.equal(catalogWritten, true);
  assert.equal(result.ok, false); assert.equal(result.code, 'stale-catalog');
  assert.deepEqual(await counts(), beforeCounts);
  assert.deepEqual((await store.getProject(e.binding)).doc, original);
  assert.equal((await e.registry.inspect(e.binding)).catalog.count, 1);
});
test('clear winning the parent lock fences a queued old-generation copy before any destination write', { timeout: 10000 }, async t => {
  const e = await fixture(), beforeCounts = await counts();
  let entered, release, copyEntered = false;
  const ready = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; }); t.after(() => release());
  const clearingRegistry = createSourceRegistry({ withSourceTransaction: (binding, job) =>
    store.withSourceTransaction(binding, async tx => { entered(); await held; return job(tx); }) });
  const clearing = clearingRegistry.clear(e.binding, { generation: 0, revision: 1 });
  await ready;
  let attempted;
  const attempt = new Promise(resolve => { attempted = resolve; });
  const backend = { withCopyTransaction: (binding, job) => {
    attempted(); return store.withCopyTransaction(binding, tx => { copyEntered = true; return job(tx); });
  } };
  const copying = createProjectCopier(backend).copy(e.binding, e.input);
  await attempt;
  let waiting = false;
  for (let i = 0; i < 100; i++) {
    const out = await store.__testQuery("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM v2_projects%'");
    if (Number(out.rows[0].n) >= 1) { waiting = true; break; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(waiting, true); assert.equal(copyEntered, false);
  release(); assert.equal((await clearing).ok, true);
  const result = await copying;
  assert.equal(copyEntered, true); assert.equal(result.code, 'stale-catalog');
  const afterCounts = await counts();
  assert.equal(afterCounts[0].projects, beforeCounts[0].projects);
  assert.equal(afterCounts[0].history, beforeCounts[0].history);
  assert.equal(afterCounts[0].catalogs, beforeCounts[0].catalogs);
  assert.equal(Number(afterCounts[0].sources), Number(beforeCounts[0].sources) - 1);
  const current = await e.registry.inspect(e.binding);
  assert.equal(current.catalog.generation, 1); assert.equal(current.catalog.count, 0);
});
