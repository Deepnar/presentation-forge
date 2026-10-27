import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHostWake } from '../packages/agent/host-wake.ts';
import { createAutoHostWake } from '../src/agent/host-wake.js';
import { runAsAccount, currentAccount } from '../src/account.js';
import { withMeter, newMeter, currentMeter } from '../src/usage.js';
const identity = (n = 1) => ({ owner: `owner${n}`, userId: n });
const done = () => ({ ok: true, complete: true, stopReason: null, nextCursor: null, results: [] });
const page = () => ({ ...done(), complete: false, stopReason: 'scan-limit', nextCursor: { projectId: 'p1', turnId: 't1' } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function rig(t, options = {}) {
  const calls = []; let clock = 0;
  const api = createHostWake({ enabled: () => true, open: async () => ({ pickup: async (input, opts) => { calls.push({ input, opts }); return done(); } }), ...options }, { now: () => clock });
  t.after(() => api.close()); return { api, calls, time: n => { clock = n; } };
}
test('wake validates exact immutable identity without invoking accessors or services', async t => {
  let opened = 0, invoked = 0;
  const { api } = rig(t, { open: async () => { opened++; } });
  for (const v of [null, {}, { ...identity(), provider: 'PRIVATE' }, identity(0), { ...identity(), owner: null }, { get owner() { invoked++; return 'PRIVATE'; }, userId: 1 }])
    assert.equal((await api.wake(v)).ok, false);
  assert.equal(opened, 0); assert.equal(invoked, 0);
});
test('disabled wake refuses before admission work', async t => {
  const e = rig(t, { enabled: () => false, open: () => { throw new Error('PRIVATE'); } });
  assert.deepEqual(await e.api.wake(identity()), { ok: false, code: 'host-disabled' });
});
test('admitting owners occupy slots and coalesce only after successful pinned opening', async t => {
  const pending = deferred(), calls = []; let opens = 0;
  const e = rig(t, { open: async binding => { opens++; calls.push(binding); await pending.promise; return { pickup: async () => done() }; } });
  const mutable = identity(), first = e.api.wake(mutable); mutable.owner = 'foreign'; mutable.userId = 9;
  const repeated = e.api.wake(identity()); const other = e.api.wake(identity(2));
  assert.equal((await e.api.wake(identity(3))).code, 'host-busy');
  assert.equal((await e.api.wake({ ...identity(), userId: 10 })).code, 'owner-ineligible');
  pending.resolve(); assert.equal((await first).status, 'accepted'); assert.equal((await repeated).status, 'coalesced'); await other;
  assert.equal(opens, 2); assert.deepEqual(calls[0], identity());
});
test('wake cooldown and bounded record admission recover only after expiration', async t => {
  const e = rig(t);
  for (let n = 1; n <= 128; n++) { assert.equal((await e.api.wake(identity(n))).ok, true); await tick(); }
  assert.equal((await e.api.wake(identity(129))).code, 'wake-capacity');
  assert.deepEqual(await e.api.wake(identity()), { ok: false, code: 'wake-cooldown', retryAfter: 5 });
  e.time(5000); assert.equal((await e.api.wake(identity(129))).ok, true);
});
test('a job has at most two serial cycles and resumes only completed cursors', async t => {
  const calls = []; let running = 0;
  const e = rig(t, { open: async () => ({ pickup: async (input) => { assert.equal(running++, 0); calls.push(input); await tick(); running--; return page(); } }) });
  await e.api.wake(identity()); await tick(); await tick();
  assert.equal(calls.length, 2); assert.equal(calls[0].cursor, null); assert.deepEqual(calls[1].cursor, page().nextCursor);
  for (const call of calls) { assert.equal(call.maxScannedRows, 50); assert.equal(call.maxWorkItems, 5); assert.ok(call.maxElapsedMs <= 110000); }
});
test('a coalesced new hint restarts the one remaining cycle without deadline extension', async t => {
  const pending = deferred(), calls = [];
  const e = rig(t, { open: async () => ({ pickup: async input => { calls.push(input); if (calls.length === 1) await pending.promise; return page(); } }) });
  await e.api.wake(identity()); await e.api.wake(identity()); e.time(10000); pending.resolve(); await tick();
  assert.equal(calls.length, 2); assert.equal(calls[1].cursor, null); assert.equal(calls[1].maxElapsedMs, 100000);
});
test('unfinished or failed outcomes stop without self retry despite a dirty hint', async t => {
  for (const outcome of [{ ...done(), complete: false, stopReason: 'busy' }, { ...page(), ok: false }, { ...done(), results: [{ turnState: 'refused' }] }, { ...done(), results: [{ runStatus: 'failed' }] }, { ok: true, results: [] }]) {
    const pending = deferred(); let calls = 0;
    const e = rig(t, { open: async () => ({ pickup: async () => { calls++; await pending.promise; return outcome; } }) });
    await e.api.wake(identity()); await e.api.wake(identity()); pending.resolve(); await tick(); assert.equal(calls, 1);
  }
});
test('remaining time below I5 minimum starts no extra cycle', async t => {
  let calls = 0;
  const e = rig(t, { open: async () => ({ pickup: async () => { calls++; e.time(109500); return page(); } }) });
  await e.api.wake(identity()); await tick(); assert.equal(calls, 1);
});
test('expired pending opening refuses admission before late resolution and never launches work', async t => {
  const pending = deferred(); let work = 0;
  const e = rig(t, { open: async () => { await pending.promise; return { pickup: async () => { work++; return done(); } }; } });
  const receipt = e.api.wake(identity()); e.time(110001); pending.resolve();
  assert.equal((await receipt).code, 'wake-expired'); await tick(); assert.equal(work, 0);
});
test('close rejects pending admission and keeps its slot until underlying opening settles', async t => {
  const pending = deferred(); let work = 0;
  const e = rig(t, { open: async () => { await pending.promise; return { pickup: async () => { work++; return done(); } }; } });
  const receipt = e.api.wake(identity()), close = e.api.close();
  assert.equal((await receipt).code, 'host-closed'); assert.equal((await e.api.wake(identity(2))).code, 'host-closed');
  pending.resolve(); assert.deepEqual(await close, { drained: true }); assert.equal(work, 0);
});
test('close aborts active preparation and drains without leaving a dirty follow-up', async t => {
  let calls = 0, aborted = false;
  const e = rig(t, { open: async () => ({ pickup: async (_input, { signal }) => { calls++; await new Promise(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true })); return done(); } }) });
  await e.api.wake(identity()); await e.api.wake(identity()); assert.deepEqual(await e.api.close(), { drained: true });
  assert.equal(aborted, true); assert.equal(calls, 1);
});
test('opening errors are sanitized and release capacity without unhandled task rejection', async t => {
  const e = rig(t, { open: async () => { throw new Error('PRIVATE_ACCOUNT_KEY'); } });
  assert.deepEqual(await e.api.wake(identity()), { ok: false, code: 'host-unavailable' });
  assert.equal((await e.api.wake(identity(2))).code, 'host-unavailable');
});
test('default adapter clears ambient account and meter while preserving the calling request', async t => {
  const caller = { email: 'request-owner', userId: 99 }, meter = newMeter(); let seen = 0;
  const api = createAutoHostWake({ enabled: () => true, accountCheck: () => { seen++; assert.equal(currentAccount(), null); assert.equal(currentMeter(), null); },
    policy: { open: async () => { assert.equal(currentAccount(), null); assert.equal(currentMeter(), null); throw Object.assign(new Error(), { code: 'owner-ineligible' }); } } });
  t.after(() => api.close());
  await runAsAccount(caller, () => withMeter(meter, async () => { assert.equal((await api.wake(identity())).code, 'owner-ineligible'); assert.equal(currentAccount(), caller); assert.equal(currentMeter(), meter); }));
  assert.equal(seen, 1);
});

test('disablement while admission opens refuses before acknowledgement or pickup', async t => {
  const pending = deferred(); let enabled = true, worked = 0;
  const e = rig(t, { enabled: () => enabled, open: async () => { await pending.promise; return { pickup: async () => { worked++; return done(); } }; } });
  const receipt = e.api.wake(identity()); enabled = false; pending.resolve();
  assert.equal((await receipt).code, 'host-disabled'); assert.equal(worked, 0);
});
