import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wakeScenario } from '../../../test/v2-host-wake-fixture.js';
import { lookup, targetRequest } from '../../../test/v2-target-wake-fixture.js';
import { createAutoHostPolicy } from '../../../src/agent/auto-host-policy.js';
import { openAutoTargetWork } from '../../../src/agent/target-work.js';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('deadline during actual H preflight refuses all pending receipts and late inspection dispatches nothing', { timeout: 5000 }, async t => {
  const held = deferred(), reached = deferred(); t.after(() => held.resolve());
  const e = await wakeScenario(t), input = lookup(await e.submit());
  let inspections = 0, configs = 0, clock = 0, expiry;
  const backend = { ...e.store, withRuntimeTransaction: async (...args) => {
    const result = await e.store.withRuntimeTransaction(...args);
    inspections++; if (inspections === 1) { reached.resolve(); await held.promise; }
    return result;
  } };
  const api = e.host({ now: () => clock, backend: async () => backend,
    policy: createAutoHostPolicy({ ...e.policyOptions, readConfiguration: () => { configs++; throw new Error('Must not resolve provider'); } }) });
  const originalSet = globalThis.setTimeout; let receipt;
  try {
    globalThis.setTimeout = (fn, ms, ...args) => { if (ms === 110000) expiry = fn; return originalSet(fn, ms, ...args); };
    receipt = api.wake(targetRequest(e, input));
  } finally { globalThis.setTimeout = originalSet; }
  await reached.promise;
  const coalesced = api.wake(targetRequest(e, input));
  assert.equal(inspections, 1); assert.equal(typeof expiry, 'function');
  clock = 110000; expiry();
  assert.deepEqual(await receipt, { ok: false, code: 'wake-expired' });
  assert.deepEqual(await coalesced, { ok: false, code: 'wake-expired' });
  assert.equal(inspections, 1); assert.equal(configs, 0);
  held.resolve(); assert.deepEqual(await api.close(), { drained: true });
  assert.equal((await e.turn()).state, 'submitted');
  assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0); assert.equal(inspections, 1);
});

test('account recreated after successful target preflight cannot use the captured work session', { timeout: 5000 }, async t => {
  const e = await wakeScenario(t), input = lookup(await e.submit()); let configs = 0;
  const session = await openAutoTargetWork(e.identity, { projectId: e.doc.id, ...input }, {
    enabled: () => true, backend: async () => e.store,
    policy: createAutoHostPolicy({ ...e.policyOptions, readConfiguration: () => { configs++; throw new Error('Must not resolve provider'); } }),
  });
  e.db.prepare('DELETE FROM users WHERE id=?').run(e.userId);
  const stamp = new Date().toISOString();
  e.db.prepare('INSERT INTO users(email,name,created_at,verified_at) VALUES(?,?,?,?)').run(e.owner, 'Replacement', stamp, stamp);
  assert.notEqual(e.db.prepare('SELECT id FROM users WHERE email=?').get(e.owner).id, e.userId);
  await assert.rejects(session.work(), error => error.code === 'owner-ineligible');
  assert.equal(configs, 0); assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0);
  assert.equal((await e.turn()).state, 'submitted'); assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
});
