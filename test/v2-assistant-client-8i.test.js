import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assistantScope, assistantSubmission, createAssistantApi, assistantFailure } from '../app/web/src/lib/v2assistant.js';
import { createAssistantController } from '../app/web/src/lib/assistantController.js';
import { seed } from './v2-tool-fixture.js';
const tick = () => new Promise(r => setImmediate(r));
function deferred() { let resolve; return { promise: new Promise(r => { resolve = r; }), resolve: value => resolve(value) }; }
const scope = () => assistantScope(seed(), 's1', ['text']);
const snapshot = () => ({ revision: 0, scope: scope(), scopeMode: 'slide', slideId: 's1' });
const view = (turns = []) => ({ ok: true, generation: 'g1', revision: 0, turns, total: turns.length });
const turn = (state = 'submitted') => ({ id: 't1', state, request: 'Shorten this.', projectRevision: 0, run: null, proposal: null });
function rig(t, overrides = {}, bridge = {}) {
  let result = view(), valid = true, clock = 0, serial = 0;
  const calls = [], timers = new Map(), state = [];
  const api = { token: 'token', projectId: 'p1', check: () => { if (!valid) throw assistantFailure('session-changed'); },
    availability: async () => ({ ok: true, version: 1, enabled: true }), read: async () => result,
    submit: async body => { calls.push(['submit', body]); result = { ...view([turn()]), revision: 1 }; return { ...result, turn: result.turns[0] }; },
    wake: async body => { calls.push(['wake', body]); return { ok: true, status: 'accepted' }; },
    cancel: async body => { calls.push(['cancel', body]); result = { ...view([turn('cancelled')]), revision: 2 }; return result; },
    decide: async body => { calls.push(['decide', body]); return { ok: true, generation: 'g1' }; },
    clear: async body => { calls.push(['clear', body]); return result = { ...view(), generation: 'g2' }; },
    export: async () => result, ...overrides };
  const c = createAssistantController({ api, bridge: { settle: async () => snapshot(), syncSaved: async () => ({ loaded: false }), ...bridge },
    onChange: value => state.push(value), uuid: () => 'request-' + ++serial, now: () => clock,
    timer: (fn, ms) => { const id = ++serial; timers.set(id, { fn: () => { timers.delete(id); return fn(); }, ms }); return id; }, untimer: id => timers.delete(id) });
  t.after(() => c.dispose());
  return { c, calls, timers, state, result: value => { result = value; }, expire: () => { valid = false; }, time: value => { clock = value; } };
}
test('Assistant scope is semantic, bounds edits and discloses current-slide reads', () => {
  const scenes = seed(); scenes[0].elements[1].locked = true;
  assert.deepEqual(assistantScope(scenes, 's1', ['text'], 'selection').editableTargets, [{ slideId: 's1', elementId: 'text' }]);
  const selected = assistantScope(scenes, 's1', ['chart'], 'selection'); assert.equal(selected.mode, 'inspect'); assert.deepEqual(selected.readableSlides, ['s1']);
  assert.throws(() => assistantScope(scenes, 's1', [], 'selection'));
  assert.throws(() => assistantScope(scenes, 's1', Array.from({ length: 33 }, (_, i) => 'x' + i), 'selection'));
  const body = assistantSubmission(snapshot(), view(), 'Shorten this.', 'key');
  assert.equal(body.projectRevision, 0); assert.equal(body.maxOutputTokens, 2048); assert.equal(body.limits.maxExchanges, 4);
  for (const key of ['x', 'family', 'color', 'provider', 'apiKey']) assert.equal(Object.hasOwn(body, key), false);
});
test('Assistant scope cannot edit a protected ancestor or silently truncate large target sets', () => {
  const scenes = seed(), text = scenes[0].elements[0]; scenes[0].elements = [{ id: 'group', kind: 'group', locked: true, group: { children: [text] } }];
  assert.equal(assistantScope(scenes, 's1', ['text'], 'selection').editableTargets.length, 0);
  scenes[0].elements = Array.from({ length: 257 }, (_, i) => ({ ...text, id: 't' + i }));
  assert.throws(() => assistantScope(scenes, 's1', []), /scope-limit/);
});
test('Assistant API pins credential across awaits and never forwards a replacement session', async () => {
  let token = 'old', seen; const pending = deferred();
  const api = createAssistantApi({ projectId: 'p1', token: 'old', current: () => token,
    fetchFn: async (url, options) => { seen = { url, options }; await pending.promise; return new Response(JSON.stringify(view())); } });
  const response = api.read(); token = 'new'; pending.resolve(); await assert.rejects(response, { code: 'session-changed' });
  assert.equal(seen.options.headers.Authorization, 'Bearer old');
  await assert.rejects(() => api.submit({}), { code: 'session-changed' });
});
test('Assistant API keeps fixed private failure and bounded retry data', async () => {
  const api = createAssistantApi({ projectId: 'p1', token: 't', current: () => 't', fetchFn: async () => new Response('{"ok":false,"code":"host-busy"}', { status: 503, headers: { 'Retry-After': '999' } }) });
  await assert.rejects(api.wake({ generation: 'g', turnId: 't' }), e => e.code === 'host-busy' && e.retryAfter === null);
});
test('Send freezes user intent first and captures revision only after successful settlement', async t => {
  const pending = deferred(); let seen;
  const e = rig(t, {}, { settle: async options => { seen = options; await pending.promise; return { ...snapshot(), revision: 9 }; } });
  await e.c.start(); e.c.setDraft('Shorten this.'); const intent = { slideId: 's1', selectedIds: ['text'], scopeMode: 'slide' };
  const sending = e.c.send(intent); intent.selectedIds[0] = 'foreign'; assert.equal(e.calls.length, 0);
  pending.resolve(); await sending;
  assert.deepEqual(seen.selectedIds, ['text']); assert.equal(seen.token, 'token'); assert.equal(e.calls[0][1].projectRevision, 9);
  assert.deepEqual(e.calls[1], ['wake', { generation: 'g1', turnId: 't1' }]);
});
test('failed save preserves message and does not submit or wake', async t => {
  const e = rig(t, {}, { settle: async () => { throw assistantFailure('save-blocked'); } });
  await e.c.start(); e.c.setDraft('Keep my draft'); await e.c.send({});
  assert.equal(e.c.snapshot().draft, 'Keep my draft'); assert.equal(e.calls.length, 0); assert.equal(e.c.snapshot().error, 'save-blocked');
});
test('an ambiguous submission retries its exact body and key without another settlement', async t => {
  const bodies = []; let settles = 0;
  const e = rig(t, { submit: async body => { bodies.push(structuredClone(body)); if (bodies.length === 1) throw new Error('socket'); return { ...view([turn()]), turn: turn() }; } }, { settle: async () => { settles++; return snapshot(); } });
  await e.c.start(); e.c.setDraft('Shorten this.'); await e.c.send({}); await e.c.send({});
  assert.deepEqual(bodies[0], bodies[1]); assert.equal(settles, 1); assert.equal(e.c.snapshot().draft, '');
});
test('Cancel remains reachable while wake admission is unresolved; late receipt cannot resurrect the turn', async t => {
  const pending = deferred(), e = rig(t, { wake: async () => pending.promise });
  await e.c.start(); e.c.setDraft('Shorten this.'); const send = e.c.send({});
  await tick(); assert.equal(e.c.snapshot().busy, 'wake'); await e.c.cancel(turn());
  assert.equal(e.calls.filter(([kind]) => kind === 'cancel').length, 1); assert.equal(e.c.snapshot().page.turns[0].state, 'cancelled');
  pending.resolve({ ok: true, status: 'accepted' }); await send; assert.equal(e.c.snapshot().page.turns[0].state, 'cancelled'); assert.equal(e.c.snapshot().busy, null);
});
test('stale proposal after human save cannot rebind approval to the newer revision', async t => {
  const proposal = { ...turn('awaiting-decision'), proposal: { id: 'proposal', revision: 0, edits: [] } };
  const e = rig(t, {}, { settle: async () => ({ revision: 2 }) }); e.result(view([proposal])); await e.c.start();
  await e.c.decide(proposal, 'approve', { generation: 'g1', revision: 0 });
  assert.equal(e.c.snapshot().error, 'stale-project'); assert.equal(e.calls.length, 0);
});
test('clear retains its confirmed generation and revision rather than rebinding to a poll', async t => {
  const e = rig(t); e.result({ ...view([turn()]), revision: 4 }); await e.c.start();
  await e.c.clear({ generation: 'old', revision: 1 }); assert.deepEqual(e.calls[0], ['clear', { generation: 'old', revision: 1 }]);
});
test('polling is finite and hidden/disposed sessions retain no timers or private state', async t => {
  const e = rig(t); e.result(view([turn()])); await e.c.start(); assert.equal(e.timers.size, 1);
  e.time(130001); const pending = [...e.timers.values()][0]; await pending.fn(); await tick(); assert.equal(e.timers.size, 0);
  assert.match(e.c.snapshot().notice, /Observation paused/); e.c.setVisible(false); assert.equal(e.timers.size, 0);
  e.c.setDraft('Private'); e.expire(); e.c.checkSession(); assert.equal(e.c.snapshot().page, null); assert.equal(e.c.snapshot().draft, '');
  e.c.dispose(); assert.equal(e.timers.size, 0);
});
test('default-off availability reads existing chat without submission or work', async t => {
  const e = rig(t, { availability: async () => ({ ok: true, version: 1, enabled: false }) }); await e.c.start();
  e.c.setDraft('Do not spend'); await e.c.send({}); assert.equal(e.calls.length, 0); assert.equal(e.c.snapshot().status, 'ready');
});

test('revoked authority latches the panel closed against late successful reads', async t => {
  const pending = deferred(), e = rig(t, { availability: async () => pending.promise, read: async () => { throw assistantFailure('unauthorized', 401); } });
  const start = e.c.start(); await e.c.refresh(); assert.equal(e.c.snapshot().status, 'expired');
  pending.resolve({ ok: true, version: 1, enabled: true }); await start;
  assert.equal(e.c.snapshot().status, 'expired'); assert.equal(e.c.snapshot().available, false); assert.equal(e.c.snapshot().page, null);
});
test('wake backoff keeps one captured target and makes at most one automatic retry', async t => {
  let calls = 0; const targets = [];
  const e = rig(t, { wake: async body => { calls++; targets.push(body); throw assistantFailure('host-busy', 503, 1); } });
  await e.c.start(); e.c.setDraft('Shorten this.'); const send = e.c.send({}); await tick();
  assert.equal(calls, 1); const retry = [...e.timers.values()].find(t => t.ms === 1000); assert.ok(retry); retry.fn(); await send;
  assert.equal(calls, 2); assert.deepEqual(targets[0], targets[1]); assert.equal(e.c.snapshot().error, 'host-busy');
});
