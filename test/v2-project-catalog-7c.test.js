import { test } from 'node:test';
import assert from 'node:assert/strict';

test('saved and generated identities remain distinct even with identical names and ids', async () => {
  const { catalogEntries } = await import('../app/web/src/lib/projectCatalog.js');
  const rows = catalogEntries([{ id: 'same', title: 'Same', updatedAt: '2026-01-01' }], [{ slug: 'same', title: 'Same', updated: '2026-01-01', deck: true }]);
  assert.deepEqual(rows.map(row => row.key), ['generated:same', 'saved:same']);
});

import { catalogEntries, filterCatalog, createCatalogLoader } from '../app/web/src/lib/projectCatalog.js';
const saved = (id = 'a', extra = {}) => ({ id, title: 'Saved presentation', updatedAt: '2026-01-01', ...extra });
const generated = (slug = 'b', extra = {}) => ({ slug, title: 'Generated work', deck: true, updated: '2026-01-02', ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(check) { for (let i = 0; i < 100; i++) { if (check()) return; await tick(); } assert.fail('condition never settled'); }
function loader(t, overrides = {}) {
  const states = [];
  const instance = createCatalogLoader({ saved: async () => [saved()], generated: async () => [generated()], search: async () => [], onChange: state => states.push(state), delay: 2, ...overrides });
  t.after(instance.dispose); return { instance, states };
}

test('the mixed catalog sorts source timestamps deterministically without changing metadata', () => {
  const a = saved('x', { updatedAt: 'invalid' }), b = generated('x', { updated: 1000 }); const before = structuredClone([a, b]);
  assert.deepEqual(catalogEntries([a], [b]).map(row => row.key), ['generated:x', 'saved:x']); assert.deepEqual([a, b], before);
});
test('source-qualified duplicates never hide an independently saved copy', () => {
  assert.equal(catalogEntries([saved('x'), saved('x')], [generated('x')]).length, 2);
});
test('filters preserve report-only and combined-artifact generated entries', () => {
  const rows = catalogEntries([saved()], [generated('report', { deck: false, report: true }), generated('both', { report: true }), generated()]);
  assert.equal(filterCatalog(rows, { type: 'saved' }).length, 1); assert.equal(filterCatalog(rows, { type: 'generated' }).length, 3);
  assert.deepEqual(filterCatalog(rows, { type: 'reports' }).map(row => row.id), ['both', 'report']);
});
test('title/id/theme matches and content hits share one catalog without trusting foreign hits', () => {
  const rows = catalogEntries([saved('matching', { theme: { name: 'Warm' } })], [generated('remote'), generated('themed', { theme: 'Warm' })]);
  assert.equal(filterCatalog(rows, { query: ' wArM ' }).length, 2);
  assert.deepEqual(filterCatalog(rows, { query: 'deep content', hits: ['remote', 'not-authorized', 'matching'] }).map(row => row.key), ['generated:remote']);
  assert.equal(filterCatalog(rows, { query: 'MATCHING' }).length, 1);
});
test('two independent reads publish useful results before the other source finishes', async t => {
  const hold = deferred(); const { instance } = loader(t, { generated: () => hold.promise }); instance.refresh();
  await until(() => instance.snapshot().saved.status === 'ready'); assert.equal(instance.snapshot().generated.status, 'loading');
  hold.resolve([generated()]); await until(() => instance.snapshot().generated.status === 'ready');
});
test('a failing source does not erase the healthy list and retries only its own source', async t => {
  let attempts = 0, savedReads = 0;
  const { instance } = loader(t, { saved: async () => { savedReads++; return [saved()]; }, generated: async () => { if (++attempts === 1) throw new Error('offline'); return [generated()]; } });
  instance.refresh(); await until(() => instance.snapshot().generated.status === 'error'); assert.equal(instance.snapshot().saved.items.length, 1);
  instance.refresh('generated'); await until(() => instance.snapshot().generated.status === 'ready'); assert.equal(savedReads, 1); assert.equal(attempts, 2);
});
test('a newer refresh aborts and cannot be replaced by an older response', async t => {
  const hold = deferred(); let calls = 0, signal;
  const { instance } = loader(t, { saved: options => { if (++calls === 1) { signal = options.signal; return hold.promise; } return [saved('new')]; } });
  instance.refresh('saved'); await tick(); instance.refresh('saved'); await until(() => instance.snapshot().saved.status === 'ready');
  hold.resolve([saved('old')]); await tick(); assert.equal(signal.aborted, true); assert.equal(instance.snapshot().saved.items[0].id, 'new');
});
test('a stalled source times out, aborts and leaves the other source usable', async t => {
  let signal; const { instance } = loader(t, { timeout: 15, generated: options => { signal = options.signal; return new Promise(() => {}); } });
  instance.refresh(); await until(() => instance.snapshot().generated.status === 'error'); assert.equal(signal.aborted, true); assert.equal(instance.snapshot().saved.status, 'ready');
});
test('debounce issues only the current normalized search query', async t => {
  const queries = []; const { instance } = loader(t, { search: async q => { queries.push(q); return ['b']; } });
  instance.setQuery('old'); instance.setQuery(' New '); await until(() => instance.snapshot().search.status === 'ready'); assert.deepEqual(queries, ['new']);
});
test('a late older content search cannot overwrite the current query', async t => {
  const hold = deferred(); let signal;
  const { instance } = loader(t, { search: (q, options) => { if (q === 'old') { signal = options.signal; return hold.promise; } return ['new']; } });
  instance.setQuery('old'); await until(() => signal); instance.setQuery('new'); await until(() => instance.snapshot().search.status === 'ready');
  hold.resolve(['old']); await tick(); assert.equal(signal.aborted, true); assert.deepEqual(instance.snapshot().search.hits, ['new']);
});
test('clearing the query removes content hits immediately and cancels delayed work', async t => {
  let calls = 0; const { instance } = loader(t, { delay: 15, search: async () => { calls++; return ['b']; } });
  instance.setQuery('anything'); instance.setQuery(''); await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(calls, 0); assert.deepEqual(instance.snapshot().search, { status: 'idle', query: '', hits: [] });
});
test('failed content search is explicit and can retry the current query', async t => {
  let calls = 0; const { instance } = loader(t, { search: async () => { if (++calls === 1) throw new Error('search unavailable'); return ['b']; } });
  instance.setQuery('content'); await until(() => instance.snapshot().search.status === 'error'); assert.deepEqual(instance.snapshot().search.hits, []);
  instance.refresh('search'); await until(() => instance.snapshot().search.status === 'ready'); assert.deepEqual(instance.snapshot().search.hits, ['b']);
});
test('malformed source and search responses are never reported as ready empty lists', async t => {
  const { instance } = loader(t, { saved: async () => undefined, search: async () => ({ hits: ['b'] }) });
  instance.refresh('saved'); instance.setQuery('x'); await until(() => instance.snapshot().saved.status !== 'loading' && instance.snapshot().search.status === 'error');
  assert.equal(instance.snapshot().saved.status, 'error');
});
test('invalid identities are refused before a card can build an unintended route', async t => {
  const { instance } = loader(t, { generated: async () => [{ title: 'No slug' }] }); instance.refresh('generated');
  await until(() => instance.snapshot().generated.status === 'error'); assert.throws(() => catalogEntries([{}]), /identity/);
});
test('disposal aborts both sources and prevents any late publication or new work', async t => {
  const hold = deferred(), signals = []; let calls = 0;
  const request = options => { calls++; signals.push(options.signal); return hold.promise; };
  const { instance, states } = loader(t, { saved: request, generated: request }); instance.refresh(); await tick(); const count = states.length;
  instance.dispose(); hold.resolve([]); instance.refresh(); await tick(); assert.equal(states.length, count); assert.equal(calls, 2); assert.ok(signals.every(signal => signal.aborted));
});
test('session expiry cannot publish an old-account response or schedule a new read', async t => {
  let current = true, calls = 0; const hold = deferred();
  const { instance, states } = loader(t, { isCurrent: () => current, saved: () => { calls++; return hold.promise; } });
  instance.refresh('saved'); await tick(); const count = states.length; current = false; hold.resolve([saved('old-account')]); await tick(); instance.refresh();
  assert.equal(states.length, count); assert.equal(calls, 1);
});
