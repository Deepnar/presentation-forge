import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurnDiscovery } from '../packages/agent/turn-discovery.ts';
import { createTurnWorker } from '../packages/agent/turn-worker.ts';
import { turnDiscoveryQuery } from '../src/projects/turn-discovery-query.js';
import { rawQuery, seedMetadata, databaseSnapshot, byteOrder } from './v2-turn-discovery-fixture.js';
import { fixture, proposed, decision } from './v2-turns-contract.js';
import { submission } from './v2-turns-contract.js';
import { expectedReview } from './v2-provider-contract.js';

export function discoveryContract(label, setup) {
  const check = (name, body) => test(`${label}: ${name}`, { timeout: 45000 }, t => body(t));
  const page = (e, limit = 50, cursor = null, owner = e.binding.owner) =>
    createTurnDiscovery(e.store).discover({ owner }, { limit, cursor });
  check('empty discovery creates no chat, run, revision or accounting row', async t => {
    const e = await setup(t); await page(e);
    const before = await databaseSnapshot(e), result = await page(e);
    assert.deepEqual(result, { ok: true, items: [], scannedRows: 0, hasMore: false, nextCursor: null });
    assert.equal((await rawQuery(e, 'SELECT * FROM v2_agent_conversations WHERE project_id=?', [e.doc.id])).length, 0);
    assert.equal(await databaseSnapshot(e), before);
  });
  check('SQL owner predicates isolate null, case and Unicode identities before page limits', async t => {
    const e = await setup(t), base = e.binding.owner;
    const owners = [base, base.toUpperCase(), `${base}-é`, `${base}-é`, null];
    const expected = new Map();
    for (const owner of owners) {
      const { doc } = await e.store.createProject({ owner, title: 'Owned metadata', scenes: e.doc.scenes });
      const other = { ...e, doc, binding: { owner, id: doc.id } };
      const [row] = await seedMetadata(other, ['submitted']); expected.set(owner, row.turn_id);
    }
    for (const owner of owners) {
      const result = await page(e, 1, null, owner);
      assert.equal(result.items.length, 1); assert.equal(result.items[0].turnId, expected.get(owner));
      assert.equal(result.hasMore, false);
    }
  });
  check('keyset pagination progresses across empty filtered pages and multiple projects', async t => {
    const e = await setup(t), all = [], candidates = [];
    for (let i = 0; i < 3; i++) {
      const { doc } = await e.store.createProject({ owner: e.binding.owner, title: 'Traversal', scenes: e.doc.scenes });
      const rows = await seedMetadata({ ...e, doc, binding: { ...e.binding, id: doc.id } }, ['cancelled', 'rejected', 'submitted']);
      all.push(...rows.map(row => [doc.id, row.turn_id])); candidates.push(rows[2].turn_id);
    }
    all.sort((a, b) => byteOrder(a[0], b[0]) || byteOrder(a[1], b[1]));
    const visited = [], found = []; let cursor = null;
    do {
      const result = await page(e, 1, cursor); found.push(...result.items.map(x => x.turnId));
      assert.equal(result.scannedRows, 1);
      if (result.hasMore) visited.push([result.nextCursor.projectId, result.nextCursor.turnId]);
      cursor = result.nextCursor;
    } while (cursor && visited.length < 20);
    assert.equal(cursor, null); assert.deepEqual(visited, all.slice(0, -1));
    assert.deepEqual(found.sort(), candidates.sort());
  });
  check('foreign, deleted and nonexistent cursor positions need no existence capability', async t => {
    const e = await setup(t), own = await seedMetadata(e, ['submitted']);
    const { doc } = await e.store.createProject({ owner: 'foreign', title: 'Private', scenes: e.doc.scenes });
    for (const projectId of [doc.id, '0', 'zzzzzz']) {
      const result = await page(e, 1, { projectId, turnId: 'position-only' });
      assert.deepEqual(result.items.map(x => x.turnId), byteOrder(e.doc.id, projectId) > 0 ? [own[0].turn_id] : []);
    }
    await e.store.deleteProject({ owner: 'foreign', id: doc.id });
    await assert.doesNotReject(() => page(e, 1, { projectId: doc.id, turnId: 'position-only' }));
  });
  check('Unicode cursor order matches binary database order for BMP and supplementary IDs', async t => {
    const e = await setup(t), ids = ['z', '\ue000', '😀'].map(x => `${e.doc.id}-${x}`);
    await seedMetadata(e, ['submitted', 'cancelled', 'rejected'], ids);
    const raw = await e.store.readTurnMetadataPage({ owner: e.binding.owner, limit: 50, cursor: null });
    assert.deepEqual(raw.map(x => x.turn_id), [...ids].sort(byteOrder));
    let cursor = null; const positions = [];
    do { const result = await page(e, 1, cursor); cursor = result.nextCursor;
      if (cursor) positions.push(cursor.turnId);
    } while (cursor);
    assert.deepEqual(positions, ids.slice(0, -1));
  });
  check('at-limit pages materialize at most51rows and preserve all stored bytes', async t => {
    const e = await setup(t); await seedMetadata(e, [...Array(127).fill('cancelled'), 'submitted']);
    const before = await databaseSnapshot(e), started = performance.now();
    const raw = await e.store.readTurnMetadataPage({ owner: e.binding.owner, limit: 50, cursor: null });
    assert.equal(raw.length, 51);
    let cursor = null, scanned = 0, candidates = 0, pages = 0;
    do { const result = await page(e, 50, cursor); scanned += result.scannedRows;
      candidates += result.items.length; pages++; cursor = result.nextCursor;
    } while (cursor && pages < 5);
    assert.equal(scanned, 128); assert.equal(candidates, 1); assert.equal(pages, 3);
    assert.equal(await databaseSnapshot(e), before);
    t.diagnostic(JSON.stringify({ sample: '128legitimate bounded turn records, one owner/project', pages, scanned,
      elapsedMs: performance.now() - started, physicalWorkBoundClaimed: false }));
    const query = turnDiscoveryQuery({ owner: e.binding.owner, limit: 50, cursor: null }, label === 'SQLite' ? 'sqlite' : 'postgres');
    const plan = label === 'SQLite' ? await rawQuery(e, `EXPLAIN QUERY PLAN ${query.sql}`, query.params)
      : (await e.store.__testQuery(`EXPLAIN (FORMAT JSON) ${query.sql}`, query.params)).rows;
    t.diagnostic(JSON.stringify({ queryPlan: plan, noNewIndex: true }));
  });
  check('oversized multibyte metadata and missing/mismatched headers refuse bounded private pages', async t => {
    const e = await setup(t); const [row] = await seedMetadata(e, ['submitted']);
    const originalHeader = (await rawQuery(e, 'SELECT payload FROM v2_agent_conversations WHERE project_id=?', [e.doc.id]))[0].payload;
    for (const [table, column, value, expectedNull] of [
      ['v2_agent_turns', 'payload', '😀'.repeat(2049), 'turn_payload'],
      ['v2_agent_conversations', 'payload', '😀'.repeat(5000), 'header_payload'],
    ]) {
      await rawQuery(e, `UPDATE ${table} SET ${column}=? WHERE project_id=?`, [value, e.doc.id]);
      const raw = await e.store.readTurnMetadataPage({ owner: e.binding.owner, limit: 50, cursor: null });
      assert.equal(raw[0][expectedNull], null);
      assert.ok(Buffer.byteLength(JSON.stringify(raw)) < 25000);
      await assert.rejects(() => page(e), error => { assert.equal(error.code, 'invalid-document');
        assert.equal(error.message, 'Turn discovery operation failed.'); return true; });
      await rawQuery(e, `UPDATE ${table} SET ${column}=? WHERE project_id=?`, [table === 'v2_agent_turns' ? row.turn_payload : originalHeader, e.doc.id]);
    }
    await rawQuery(e, 'UPDATE v2_agent_turns SET generation=? WHERE project_id=?', ['wrong-generation', e.doc.id]);
    await assert.rejects(() => page(e), { code: 'invalid-document' });
    await rawQuery(e, 'UPDATE v2_agent_turns SET generation=? WHERE project_id=?', [row.generation, e.doc.id]);
    await rawQuery(e, 'DELETE FROM v2_agent_conversations WHERE project_id=?', [e.doc.id]);
    await assert.rejects(() => page(e), { code: 'invalid-document' });
    assert.equal((await rawQuery(e, 'SELECT * FROM v2_agent_conversations WHERE project_id=?', [e.doc.id])).length, 0);
  });
  if (label === 'SQLite') check('NUL-prefixed oversized SQLite TEXT and IDs never materialize unbounded', async t => {
    const e = await setup(t); const [row] = await seedMetadata(e, ['submitted']);
    const malformed = '\0' + 'PRIVATE'.repeat(200000);
    for (const column of ['payload', 'id', 'generation']) {
      await rawQuery(e, `UPDATE v2_agent_turns SET ${column}=? WHERE project_id=?`, [malformed, e.doc.id]);
      const lengths = (await rawQuery(e, `SELECT length(${column}) AS chars,length(CAST(${column} AS BLOB)) AS bytes FROM v2_agent_turns WHERE project_id=?`, [e.doc.id]))[0];
      assert.equal(lengths.chars, 0); assert.ok(lengths.bytes > 1000000);
      const raw = await e.store.readTurnMetadataPage({ owner: e.binding.owner, limit: 50, cursor: null });
      assert.equal(raw[0][column === 'payload' ? 'turn_payload' : column === 'id' ? 'turn_id' : 'generation'], null);
      assert.ok(Buffer.byteLength(JSON.stringify(raw)) < 25000);
      await assert.rejects(() => page(e), { code: 'invalid-document' });
      await rawQuery(e, `UPDATE v2_agent_turns SET ${column}=? WHERE project_id=?`,
        [column === 'payload' ? row.turn_payload : column === 'id' ? row.turn_id : row.generation, e.doc.id]);
    }
  });
  check('private chat and project bodies are never loaded by discovery', async t => {
    const e = await setup(t); const [row] = await seedMetadata(e, ['submitted']);
    const secret = 'PRIVATE_BODY_NOT_JSON'.repeat(100000);
    await rawQuery(e, 'UPDATE v2_projects SET payload=? WHERE id=?', [secret, e.doc.id]);
    await rawQuery(e, 'UPDATE v2_agent_turns SET private_payload=? WHERE project_id=?', [secret, e.doc.id]);
    const before = await databaseSnapshot(e), result = await page(e);
    assert.equal(result.items[0].turnId, row.turn_id); assert.equal(JSON.stringify(result).includes('PRIVATE_BODY'), false);
    assert.equal(await databaseSnapshot(e), before);
    await assert.rejects(() => createTurnWorker(e.store).work(e.binding,
      { generation: row.generation, turnId: row.turn_id, workerId: 'fixture-host' }), { code: 'invalid-document' });
  });
  check('discovery never reconciles expired preparation or changes a live lease', async t => {
    const e = await setup(t); const [row] = await seedMetadata(e, ['preparing']);
    const meta = JSON.parse(row.turn_payload); meta.createdAt = 1; meta.updatedAt = 1;
    meta.prepDeadline = 120001; meta.planDeadline = 1200001; meta.lease.until = 30001;
    await rawQuery(e, 'UPDATE v2_agent_turns SET payload=? WHERE project_id=?', [JSON.stringify(meta), e.doc.id]);
    const before = await databaseSnapshot(e), result = await page(e);
    assert.equal(result.items[0].state, 'preparing'); assert.equal(result.items[0].leaseUntil, 30001);
    assert.equal(await databaseSnapshot(e), before);
  });
  check('discovered submissions are fenced by clear and ownership change before I2', async t => {
    const e = await setup(t); await seedMetadata(e, ['submitted']);
    const hint = (await page(e)).items[0], state = await e.service.read(e.binding);
    await e.service.clear(e.binding, { generation: state.generation, revision: state.revision });
    const work = { generation: hint.generation, turnId: hint.turnId, workerId: 'discovery-host' };
    assert.equal((await createTurnWorker(e.store).work(e.binding, work)).code, 'stale-generation');
    await seedMetadata(e, ['submitted']); const next = (await page(e)).items[0];
    await rawQuery(e, 'UPDATE v2_projects SET owner=? WHERE id=?', ['revoked-owner', e.doc.id]);
    assert.equal((await page(e)).items.length, 0);
    await assert.rejects(() => createTurnWorker(e.store).work(e.binding, { ...work, generation: next.generation, turnId: next.turnId }), { code: 'not-found' });
  });
  check('a human save fences a discovered preparation before any provider dispatch', async t => {
    let calls = 0; const e = await fixture(t, setup, { handler(_req, res) { calls++; res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); } });
    await e.service.submit(e.binding, submission(e, e.state)); const hint = (await page(e)).items[0];
    const renamed = await e.store.renameProject({ ...e.binding, baseRevision: e.doc.revision, title: 'Human revised' });
    assert.equal(renamed.status, 'saved');
    const result = await createTurnWorker(e.store, e.provider).work(e.binding,
      { generation: hint.generation, turnId: hint.turnId, workerId: 'discovery-host' });
    assert.equal(result.code, 'stale-project'); assert.equal(calls, 0);
  });
  check('discovered approved and terminal hints still use stored approval and canonical execution', async t => {
    const e = await fixture(t, setup), proposal = await proposed(e);
    assert.equal((await page(e)).items.length, 0);
    const approved = await e.service.decide(e.binding, decision(proposal, proposal.turn));
    const before = await databaseSnapshot(e), hint = (await page(e)).items[0];
    assert.equal(hint.state, 'approved'); assert.equal(await databaseSnapshot(e), before);
    const input = { generation: hint.generation, turnId: hint.turnId, workerId: 'discovery-host' };
    const result = await createTurnWorker(e.store).work(e.binding, input);
    assert.equal(result.run.id, approved.turn.run.id); assert.equal(result.run.status, 'succeeded');
    assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, expectedReview(e.doc));
    const finished = await databaseSnapshot(e), terminal = (await page(e)).items[0];
    assert.equal(terminal.state, 'approved');
    assert.equal((await createTurnWorker(e.store).work(e.binding, input)).run.status, 'succeeded');
    assert.equal(await databaseSnapshot(e), finished);
  });
}
