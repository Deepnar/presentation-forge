import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHostWake } from '../packages/agent/host-wake.ts';
const tick = () => new Promise(r => setImmediate(r));
const identity = { owner: 'owner', userId: 1 };
const target = { projectId: 'p1', generation: 'g1', turnId: 't1' };
const request = () => ({ ...identity, target: { ...target } });
const done = () => ({ ok: true, complete: true, stopReason: null, nextCursor: null, results: [] });
function deferred() { let resolve; return { promise: new Promise(r => { resolve = r; }), resolve: v => resolve(v) }; }
test('target admission snapshots identifiers and pending identical callers share preflight', { timeout: 2000 }, async t => {
  const pending = deferred(), opened = []; let work = 0;
  const api = createHostWake({ enabled: () => true, open: async value => {
    opened.push(value); await pending.promise; return { pickup: async () => { work++; return done(); } };
  } }); t.after(async () => { pending.resolve(); await api.close(); });
  const mutable = request(), first = api.wake(mutable); mutable.target.turnId = 'foreign';
  const second = api.wake(request()); let delivered = false; second.then(() => { delivered = true; });
  await tick(); assert.equal(delivered, false); assert.deepEqual(opened, [request()]);
  assert.equal(Object.isFrozen(opened[0].target), true);
  pending.resolve(); assert.equal((await first).status, 'accepted'); assert.equal((await second).status, 'coalesced');
  await tick(); assert.equal(work, 2);
});
test('distinct target or owner-wide mode is busy without scheduling a dirty follow-up', { timeout: 2000 }, async t => {
  for (const initial of [request(), identity]) {
    const pending = deferred(); let work = 0;
    const api = createHostWake({ enabled: () => true, open: async () => ({ pickup: async () => { work++; await pending.promise; return done(); } }) });
    t.after(async () => { pending.resolve(); await api.close(); }); await api.wake(initial);
    for (const other of [initial.target ? identity : request(), { ...identity, target: { ...target, turnId: 't2' } }, { ...identity, target: { ...target, generation: 'g2' } }, { ...identity, target: { ...target, projectId: 'p2' } }]) {
      assert.deepEqual(await api.wake(other), { ok: false, code: 'host-busy', retryAfter: 1 });
    }
    pending.resolve(); await tick(); assert.equal(work, 1);
  }
});
test('target and owner-wide jobs share capacity and failed target preflight propagates to coalesced callers', { timeout: 2000 }, async t => {
  const pending = deferred(), api = createHostWake({ enabled: () => true, open: async () => { await pending.promise; throw Object.assign(new Error('PRIVATE'), { code: 'stale-generation' }); } });
  t.after(async () => { pending.resolve(); await api.close(); }); const first = api.wake(request()), same = api.wake(request());
  const other = api.wake({ owner: 'other', userId: 2 });
  assert.equal((await api.wake({ owner: 'third', userId: 3 })).code, 'host-busy');
  pending.resolve(); assert.equal((await first).code, 'stale-generation'); assert.deepEqual(await same, await first); await other;
});
test('target parser rejects authority, accessors and malformed identifiers before services', { timeout: 2000 }, async t => {
  let calls = 0, getters = 0;
  const api = createHostWake({ enabled: () => true, open: async () => { calls++; } }); t.after(() => api.close());
  for (const value of [{ ...request(), provider: 'PRIVATE' }, { ...identity, target: { ...target, workerId: 'x' } },
    { ...identity, target: { ...target, projectId: '../x' } }, { ...identity, target: { ...target, generation: 'x'.repeat(129) } },
    { ...identity, target: { ...target, turnId: '\0' } }, { ...identity, get target() { getters++; return target; } }]) {
    assert.equal((await api.wake(value)).code, 'invalid-input');
  }
  assert.equal(calls, 0); assert.equal(getters, 0);
});

test('target completion metadata stops dirty retry for refusal, unfinished or interrupted work', async () => {
  const { targetWakeResult } = await import('../packages/agent/turn-target.ts');
  const base = { ok: true, generation: 'g1', turn: { id: 't1', state: 'awaiting-decision' }, phase: 'prepare', advances: 0, reason: null, run: null };
  assert.equal(targetWakeResult(target, base).complete, true);
  for (const reason of ['busy', 'lease-lost', 'aborted', 'step-limit']) assert.equal(targetWakeResult(target, { ...base, reason }).stopReason, reason);
  const unfinished = targetWakeResult(target, { ...base, turn: { id: 't1', state: 'approved' }, run: { status: 'running' } });
  assert.equal(unfinished.complete, false); assert.equal(unfinished.nextCursor, null);
  assert.equal(targetWakeResult(target, { ok: false, code: 'stale-generation' }).ok, false);
  assert.equal(targetWakeResult(target, { ...base, turn: { id: 't1', state: 'refused' } }).results[0].turnState, 'refused');
  assert.throws(() => targetWakeResult(target, { ...base, run: { status: 'invented' } }));
});
