import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurnDiscovery, parseDiscoveryBinding, parseTurnDiscoveryInput, DISCOVERY_LIMITS }
  from '../packages/agent/turn-discovery.ts';
import { metadataRow } from './v2-turn-discovery-data.js';
import { turnDiscoveryQuery } from '../src/projects/turn-discovery-query.js';

const input = (limit = 20, cursor = null) => ({ limit, cursor });
const discovery = rows => createTurnDiscovery({ async readTurnMetadataPage() { return rows; } });

test('discovery rejects authority, unsafe values and invalid identifiers before backend I/O', async () => {
  let calls = 0, getters = 0;
  const service = createTurnDiscovery({ async readTurnMetadataPage() { calls++; return []; } });
  const accessor = { limit: 1, cursor: null };
  Object.defineProperty(accessor, 'limit', { enumerable: true, get() { getters++; return 1; } });
  const badBindings = [undefined, {}, { owner: undefined }, { owner: '' }, { owner: ' ' },
    { owner: 'x'.repeat(129) }, { owner: 'x\0y' }, { owner: '\ud800' },
    { owner: 'owner', admin: true }, { owner: 'owner', project: 'foreign' }];
  for (const binding of badBindings) await assert.rejects(() => service.discover(binding, input()), { code: 'invalid-document' });
  for (const bad of [{}, input(0), input(51), input(1.5), input(NaN), accessor,
    { ...input(), provider: 'private-key' }, input(1, { projectId: '-invalid', turnId: 't' }),
    input(1, { projectId: 'p', turnId: 't', owner: 'foreign' }),
    input(1, { projectId: 'p', turnId: 'x\0y' }), input(1, { projectId: 'p', turnId: '\udfff' }),
    input(1, { projectId: 'p', turnId: '😀'.repeat(65) })])
    await assert.rejects(() => service.discover({ owner: 'owner' }, bad), { code: 'invalid-document' });
  assert.equal(calls, 0); assert.equal(getters, 0);
  assert.deepEqual(parseDiscoveryBinding({ owner: null }), { owner: null });
  assert.deepEqual(parseTurnDiscoveryInput(input(50)), input(50));
});

test('discovery snapshots owner and nested cursor before its first await', async () => {
  let request, finish;
  const service = createTurnDiscovery({ readTurnMetadataPage(value) {
    request = value; return new Promise(resolve => { finish = resolve; });
  } });
  const binding = { owner: 'owner' }, page = input(1, { projectId: 'p0', turnId: 'before' });
  const pending = service.discover(binding, page);
  binding.owner = 'foreign'; page.limit = 50; page.cursor.projectId = 'zz';
  assert.deepEqual(request, { owner: 'owner', limit: 1, cursor: { projectId: 'p0', turnId: 'before' } });
  finish([metadataRow()]);
  assert.equal((await pending).items[0].projectId, 'project-1');
});

test('empty filtered pages progress by scanned rows, without treating candidates as a snapshot', async () => {
  const first = await discovery([metadataRow({ id: 'a', state: 'cancelled' }),
    metadataRow({ id: 'b', state: 'rejected' })]).discover({ owner: 'owner' }, input(1));
  assert.deepEqual(first, { ok: true, items: [], scannedRows: 1, hasMore: true,
    nextCursor: { projectId: 'project-1', turnId: 'a' } });
  const next = await discovery([metadataRow({ id: 'b', state: 'rejected' })])
    .discover({ owner: 'owner' }, input(1, first.nextCursor));
  assert.deepEqual(next, { ok: true, items: [], scannedRows: 1, hasMore: false, nextCursor: null });
  assert.deepEqual(await discovery([]).discover({ owner: null }, input(1)),
    { ok: true, items: [], scannedRows: 0, hasMore: false, nextCursor: null });
});

test('metadata hints preserve expired preparation, live leases and approved turns without claiming work', async () => {
  const rows = ['submitted', 'preparing', 'approved'].map((state, i) => metadataRow({ id: `t${i}`, state }));
  const before = JSON.stringify(rows), result = await discovery(rows).discover({ owner: 'owner' }, input());
  assert.deepEqual(result.items.map(x => x.state), ['submitted', 'preparing', 'approved']);
  assert.equal(result.items[0].preparationDeadline, 120001);
  assert.equal(result.items[1].leaseUntil, 30001);
  assert.equal(JSON.stringify(rows), before);
  for (const item of result.items) assert.deepEqual(Object.keys(item).sort(),
    ['generation', 'leaseUntil', 'preparationDeadline', 'projectId', 'state', 'turnId', 'turnRevision']);
  for (const secret of ['request-', 'identity', 'proposal', 'workerId', 'runId', 'owner'])
    assert.equal(JSON.stringify(result).includes(secret), false, secret);
});

test('bytewise traversal handles supplementary Unicode independently of UTF-16 sort order', async () => {
  const a = '\ue000', b = '😀'; assert.equal(b < a, true);
  const first = await discovery([metadataRow({ id: a }), metadataRow({ id: b })])
    .discover({ owner: 'owner' }, input(1));
  assert.equal(first.items[0].turnId, a);
  const second = await discovery([metadataRow({ id: b })]).discover({ owner: 'owner' }, input(1, first.nextCursor));
  assert.equal(second.items[0].turnId, b); assert.equal(second.hasMore, false);
});

test('malformed metadata and unconsumable generation refuse privately without partial results', async () => {
  const valid = metadataRow({ id: 'a' });
  for (const bad of [{ ...metadataRow({ id: 'b' }), header_payload: null },
    { ...metadataRow({ id: 'b' }), turn_payload: 'PRIVATE-CORRUPTION' },
    { ...metadataRow({ id: 'b' }), turn_payload: 'x'.repeat(4097) },
    { ...metadataRow({ id: 'b' }), generation: 'wrong' },
    metadataRow({ id: '😀'.repeat(65) }), metadataRow({ id: 'b', generation: '😀'.repeat(65) }),
    { ...metadataRow({ id: 'b' }), owner: 'foreign' },
    { ...metadataRow({ id: 'b' }), private_payload: 'PRIVATE-CORRUPTION' }]) {
    await assert.rejects(() => discovery([valid, bad]).discover({ owner: 'owner' }, input()), error => {
      assert.equal(error.code, 'invalid-document');
      assert.equal(error.message, 'Turn discovery operation failed.'); return true;
    });
  }
});

test('backend accessors, excess rows, duplicates and ordering errors cannot escape the page contract', async () => {
  let touched = 0; const row = metadataRow();
  Object.defineProperty(row, 'turn_payload', { enumerable: true, get() { touched++; return 'unsafe'; } });
  const badPages = [[row], [metadataRow(), metadataRow()], [metadataRow({ id: 'z' }), metadataRow({ id: 'a' })],
    [metadataRow({ id: 'a' }), metadataRow({ id: 'b' }), metadataRow({ id: 'c' })]];
  for (const rows of badPages) await assert.rejects(() => discovery(rows).discover({ owner: 'owner' }, input(1)), { code: 'invalid-document' });
  assert.equal(touched, 0);
});

test('complete result remains within its UTF-8 ceiling for fifty heavily escaped hints', async () => {
  const generation = '\x01'.repeat(127) + 'g';
  const rows = Array.from({ length: 50 }, (_, i) => metadataRow({
    id: '\x01'.repeat(125) + String(i).padStart(3, '0'), generation }));
  const result = await discovery(rows).discover({ owner: 'owner' }, input(50));
  const bytes = Buffer.byteLength(JSON.stringify(result));
  assert.equal(result.items.length, 50); assert.ok(bytes > 32768);
  assert.ok(bytes <= DISCOVERY_LIMITS.responseBytes);
});

test('unexpected backend exceptions retain fixed private failure while known storage codes survive', async () => {
  for (const code of [undefined, 'storage-unavailable', 'store-misconfigured']) {
    const service = createTurnDiscovery({ async readTurnMetadataPage() {
      throw Object.assign(new Error('PRIVATE SQL postgres://secret'), { code });
    } });
    await assert.rejects(() => service.discover({ owner: 'owner' }, input()), error => {
      assert.equal(error.message, 'Turn discovery operation failed.');
      assert.equal(error.code, code ?? 'discovery-failed'); return true;
    });
  }
});

test('query parameters carry owner/cursor values and every selected text has a SQL byte guard', () => {
  for (const dialect of ['sqlite', 'postgres']) {
    const query = turnDiscoveryQuery({ owner: 'private-owner', ...input(1, { projectId: 'p', turnId: 'private-turn' }) }, dialect);
    assert.ok(query.params.includes('private-owner')); assert.ok(query.params.includes('private-turn'));
    assert.equal(query.sql.includes('private-owner'), false); assert.equal(query.sql.includes('private-turn'), false);
    assert.equal(query.sql.includes('private_payload'), false);
    for (const column of ['p.id', 'p.owner', 't.id', 't.generation', 'h.payload', 't.payload'])
      assert.ok(query.sql.includes(dialect === 'sqlite' ? `length(CAST(${column} AS BLOB))` : `octet_length(${column})`));
    assert.ok(query.sql.includes(dialect === 'sqlite' ? 'p.owner COLLATE BINARY IS' : 'p.owner COLLATE "C" IS NOT DISTINCT FROM'));
  }
});
