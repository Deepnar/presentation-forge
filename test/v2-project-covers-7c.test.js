import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readProjectCover, MAX_COVER_BYTES } from '../src/projects/cover.js';
import { createCoverLoader } from '../app/web/src/lib/projectCovers.js';
import { apiCover } from '../app/web/src/lib/v2project.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const project = (id = 'project-one', revision = 0) => ({ id, revision });
const payload = p => ({ projectId: p.id, revision: p.revision, scene: { id: 'first' } });
const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
function loader(t, options = {}) {
  const instance = createCoverLoader({ request: async p => payload(p), prepare: async () => svg, ...options });
  t.after(() => instance.dispose()); return instance;
}
function result(instance, p = project()) {
  const ready = deferred();
  const off = instance.subscribe(p, state => { if (state.status !== 'loading') ready.resolve(state); });
  return { off, promise: ready.promise };
}

test('headless projection preserves authority and isolates its returned first scene', async () => {
  const doc = { id: 'saved', revision: 4, title: 'Private title', origin: { secret: 'not preview metadata' }, scenes: [{ id: 'one', elements: [{ text: 'Human edit' }] }, { id: 'two', elements: [] }] };
  const before = structuredClone(doc); let supplied;
  const cover = await readProjectCover({ getProject: async args => { supplied = args; return { doc }; } }, { id: 'saved', revision: 4, owner: 'owner', admin: false });
  assert.deepEqual(supplied, { id: 'saved', owner: 'owner', admin: false });
  assert.deepEqual(cover, { projectId: 'saved', revision: 4, scene: doc.scenes[0] });
  cover.scene.elements[0].text = 'Changed only outside store'; assert.deepEqual(doc, before);
});
test('headless projection rejects invalid revisions before reading private documents', async () => {
  let reads = 0; const store = { getProject: async () => { reads++; return {}; } };
  for (const revision of [-1, NaN, 1.5, '0', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(readProjectCover(store, { id: 'saved', revision }), { code: 'invalid-cover-revision' });
  }
  await assert.rejects(readProjectCover(store, { id: 'bad id', revision: 0 }), { code: 'invalid-id' });
  assert.equal(reads, 0);
});
test('headless projection refuses inaccessible and mismatched saved revisions', async () => {
  await assert.rejects(readProjectCover({ getProject: async () => ({ doc: null }) }, { id: 'saved', revision: 0 }), { code: 'not-found' });
  await assert.rejects(readProjectCover({ getProject: async () => ({ doc: { revision: 1 } }) }, { id: 'saved', revision: 0 }), { code: 'cover-stale' });
});
test('cover size is bounded in UTF-8 bytes without altering a saved scene', async () => {
  const doc = { id: 'saved', revision: 0, scenes: [{ text: '界'.repeat(Math.ceil(MAX_COVER_BYTES / 3)) }] };
  const original = doc.scenes[0].text;
  await assert.rejects(readProjectCover({ getProject: async () => ({ doc }) }, { id: 'saved', revision: 0 }), { code: 'cover-too-large' });
  assert.equal(doc.scenes[0].text, original);
});
test('queue coalesces identical requests and never exceeds two active jobs', async t => {
  const pending = [], starts = [];
  const instance = loader(t, { request: p => { starts.push(p.id); const next = deferred(); pending.push(() => next.resolve(payload(p))); return next.promise; } });
  const a = result(instance), duplicate = result(instance), b = result(instance, project('two')), c = result(instance, project('three'));
  await tick(); assert.deepEqual(starts, ['project-one', 'two']);
  pending[0](); assert.equal((await a.promise).status, 'ready'); assert.equal((await duplicate.promise).status, 'ready');
  await tick(); assert.deepEqual(starts, ['project-one', 'two', 'three']);
  pending[1](); pending[2](); assert.equal((await b.promise).status, 'ready'); assert.equal((await c.promise).status, 'ready');
});
test('an offscreen queued subscription is removed without starting its request', async t => {
  const hold = deferred(), starts = [];
  const instance = loader(t, { limit: 1, request: async p => { starts.push(p.id); await hold.promise; return payload(p); } });
  const first = result(instance), queued = result(instance, project('never-visible')); queued.off();
  await tick(); hold.resolve(); await first.promise; await tick(); assert.deepEqual(starts, ['project-one']);
});
test('cancelling the last visible lease aborts work and ignores a late result', async t => {
  const hold = deferred(), states = []; let signal;
  const instance = loader(t, { request: async (p, options) => { signal = options.signal; await hold.promise; return payload(p); } });
  const off = instance.subscribe(project(), state => states.push(state.status));
  await tick(); off(); assert.equal(signal.aborted, true); hold.resolve(); await tick();
  assert.deepEqual(states, ['loading']); assert.equal(instance.stats().entries, 0);
});
test('one subscriber leaving does not cancel another visible subscriber', async t => {
  const hold = deferred(); let signal;
  const instance = loader(t, { request: async (p, options) => { signal = options.signal; await hold.promise; return payload(p); } });
  const a = result(instance), b = result(instance); await tick(); a.off(); assert.equal(signal.aborted, false);
  hold.resolve(); assert.equal((await b.promise).status, 'ready');
});
test('mismatched response identity/revision is refused rather than cached', async t => {
  for (const bad of [{ projectId: 'another', revision: 0 }, { projectId: 'project-one', revision: 7 }]) {
    const instance = loader(t, { request: async () => bad });
    assert.equal((await result(instance).promise).status, 'error'); assert.equal(instance.stats().entries, 0);
  }
});
test('revision cache reuses only the same saved identity and revision', async t => {
  let requests = 0; const instance = loader(t, { request: async p => { requests++; return payload(p); } });
  (await result(instance).promise); (await result(instance).promise); assert.equal(requests, 1);
  await result(instance, project('project-one', 1)).promise; assert.equal(requests, 2);
});
test('cache evicts by entry and byte budget and refetches an evicted preview', async t => {
  const instance = loader(t, { maxEntries: 2, maxBytes: svg.length * 2 });
  for (const id of ['one', 'two', 'three']) { const run = result(instance, project(id)); await run.promise; run.off(); }
  assert.equal(instance.stats().entries, 2); assert.ok(instance.stats().bytes <= svg.length * 2);
  let starts = 0;
  const byteBound = loader(t, { maxBytes: 1, request: async p => { starts++; return payload(p); } });
  await result(byteBound).promise; await result(byteBound).promise; assert.equal(starts, 2); assert.equal(byteBound.stats().entries, 0);
});
test('failures can be retried without poisoning the revision cache', async t => {
  let requests = 0; const instance = loader(t, { request: async p => { if (++requests === 1) throw new Error('network'); return payload(p); } });
  assert.equal((await result(instance).promise).status, 'error'); assert.equal((await result(instance).promise).status, 'ready'); assert.equal(requests, 2);
});
test('queued and active stalled jobs have a bounded deadline', async t => {
  const instance = loader(t, { limit: 1, timeout: 15, request: () => new Promise(() => {}) });
  const a = result(instance), b = result(instance, project('queued'));
  assert.equal((await a.promise).code, 'cover-timeout'); assert.equal((await b.promise).code, 'cover-timeout'); assert.equal(instance.stats().active, 0);
});
test('the deadline also bounds font preparation and ignores its late completion', async t => {
  const hold = deferred(); const instance = loader(t, { timeout: 15, prepare: () => hold.promise });
  const run = result(instance); assert.equal((await run.promise).code, 'cover-timeout'); hold.resolve(svg); await tick(); assert.equal(instance.stats().entries, 0);
});
test('account changes purge ready previews and stop new reads in the stale view', async t => {
  let account = 'one', expired = 0, requests = 0; const states = [];
  const instance = loader(t, { current: () => account, onExpired: () => expired++, request: async p => { requests++; return payload(p); } });
  instance.subscribe(project(), state => states.push(state.status)); await tick();
  account = 'two'; assert.equal(instance.checkSession(), false); assert.equal(instance.stats().entries, 0);
  assert.equal((await result(instance, project('other')).promise).status, 'expired'); assert.equal(requests, 1); assert.equal(expired, 1);
  assert.deepEqual(states, ['loading', 'ready', 'expired']);
});
test('account changes during a read cannot publish its old-account response', async t => {
  let account = 'one'; const hold = deferred(), states = [];
  const instance = loader(t, { current: () => account, request: async p => { await hold.promise; return payload(p); } });
  instance.subscribe(project(), state => states.push(state.status)); await tick(); account = 'two'; hold.resolve(); await tick();
  assert.deepEqual(states, ['loading', 'expired']); assert.equal(instance.stats().entries, 0);
});
test('disposing a workspace aborts active work, clears cache and prevents queued work', async t => {
  const hold = deferred(), states = [], signals = [];
  const instance = loader(t, { limit: 1, request: async (p, { signal }) => { signals.push(signal); await hold.promise; return payload(p); } });
  instance.subscribe(project(), state => states.push(state.status)); instance.subscribe(project('queued'), () => {});
  await tick(); instance.dispose(); hold.resolve(); await tick(); assert.equal(signals.length, 1); assert.equal(signals[0].aborted, true);
  assert.deepEqual(states, ['loading']); assert.deepEqual(instance.stats(), { active: 0, queued: 0, entries: 0, bytes: 0, watchers: 0 });
});
test('cover transport uses the existing bearer identity and prevents HTTP cache reuse', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'fixture-session' } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; });
  const abort = new AbortController(); let seen;
  const response = await apiCover(project('saved/id', 7), { signal: abort.signal }, async (url, options) => { seen = { url, options }; return new Response(JSON.stringify({ ok: true, cover: payload(project('saved/id', 7)) }), { status: 200 }); });
  assert.equal(response.revision, 7); assert.equal(seen.url, '/api/v2/projects/saved%2Fid/cover?revision=7');
  assert.equal(seen.options.headers.Authorization, 'Bearer fixture-session'); assert.equal(seen.options.cache, 'no-store'); assert.equal(seen.options.signal, abort.signal);
});
test('cover transport preserves actionable errors without treating an HTTP failure as ready', async () => {
  await assert.rejects(apiCover(project(), {}, async () => new Response(JSON.stringify({ ok: false, code: 'cover-stale', error: 'changed' }), { status: 409 })), { status: 409, code: 'cover-stale' });
});

test('cancelled font-gated preparation never renders abandoned scene content', async () => {
  const { createCoverPreparer } = await import('../app/web/src/lib/projectCovers.js');
  const hold = deferred(), abort = new AbortController(); let renders = 0;
  const prepare = createCoverPreparer({ validate: async () => ({ ok: true }), fonts: () => hold.promise, render: () => { renders++; return svg; } });
  const preparing = prepare(payload(project()), { signal: abort.signal }); await tick(); abort.abort(); hold.resolve({ ready: true });
  await assert.rejects(preparing, { name: 'AbortError' }); assert.equal(renders, 0);
});
test('cancelled scene validation never starts subsequent font work', async () => {
  const { createCoverPreparer } = await import('../app/web/src/lib/projectCovers.js');
  const hold = deferred(), abort = new AbortController(); let fonts = 0;
  const prepare = createCoverPreparer({ validate: () => hold.promise, fonts: async () => { fonts++; return { ready: true }; }, render: () => svg });
  const preparing = prepare(payload(project()), { signal: abort.signal }); abort.abort(); hold.resolve({ ok: true });
  await assert.rejects(preparing, { name: 'AbortError' }); assert.equal(fonts, 0);
});
test('font coverage refusal and a transient load failure remain distinct', async () => {
  const { createCoverPreparer } = await import('../app/web/src/lib/projectCovers.js');
  for (const [faces, code] of [[{ ready: false, unsupported: ['Unknown'] }, 'cover-fonts-unsupported'], [{ ready: false, unsupported: [] }, 'cover-fonts']]) {
    const prepare = createCoverPreparer({ validate: async () => ({ ok: true }), fonts: async () => faces, render: () => { throw new Error('must not render'); } });
    await assert.rejects(prepare(payload(project()), { signal: new AbortController().signal }), { code });
  }
});
test('a failed shipped-font load can succeed on explicit preview retry', async t => {
  const { ensureDeckFonts } = await import('../app/web/src/fonts.js');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document'); let calls = 0;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { fonts: { ready: Promise.resolve(), check: () => true, load: async () => { if (++calls === 1) throw new Error('temporary font failure'); } } } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else delete globalThis.document; });
  const scenes = [{ elements: [{ paragraphs: [{ runs: [{ family: 'Inter', weight: 599 }] }] }] }];
  assert.equal((await ensureDeckFonts(scenes)).ready, false); assert.equal((await ensureDeckFonts(scenes)).ready, true); assert.equal(calls, 2);
});
