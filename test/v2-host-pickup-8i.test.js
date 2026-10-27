import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurnPickup, parsePickupInput, parsePickupBinding } from '../packages/agent/turn-pickup.ts';
import { createAutoHostPolicy, parseAutoHostConfiguration } from '../src/agent/auto-host-policy.js';
import { caps, context } from './v2-provider-fixture.js';
import { providerFailure } from '../packages/agent/provider.ts';

const input = (extra = {}) => ({ cursor: null, maxScannedRows: 50, maxWorkItems: 5, maxElapsedMs: 5000, ...extra });
const hint = (id, state = 'submitted') => ({ projectId: `p${id}`, turnId: `t${id}`, generation: 'generation', turnRevision: 1, state, preparationDeadline: 100000, leaseUntil: null });
const result = (state = 'awaiting-decision', extra = {}) => ({ ok: true, phase: 'prepare', reason: null, advances: 0, turn: { state }, run: null, ...extra });
function harness(rows, changes = {}, policyChanges = {}) {
  const calls = { reads: [], work: [], providers: 0, authorizations: 0 };
  const position = row => ({ projectId: row.projectId, turnId: row.turnId });
  const services = {
    async discover(binding, page) {
      assert.equal(binding.owner, 'owner'); assert.equal(page.limit, 1); calls.reads.push(structuredClone(page));
      const index = page.cursor ? rows.findIndex(row => row.projectId === page.cursor.projectId && row.turnId === page.cursor.turnId) + 1 : 0;
      const row = rows[index], more = index < rows.length - 1;
      return { ok: true, items: row && !row.filtered ? [row] : [], scannedRows: row ? 1 : 0, hasMore: more, nextCursor: more ? position(row) : null };
    },
    async inspect() { return { ok: true, turn: { state: 'submitted' } }; },
    async work(binding, work, provider, options) {
      calls.work.push({ binding: { ...binding }, work, provider, signal: options.signal }); return result();
    }, ...changes,
  };
  const session = { async authorize() { calls.authorizations++; },
    async provider() { calls.providers++; return { profile: {}, exchange() {} }; }, ...policyChanges };
  return { services, calls, policy: { open: async () => session } };
}

test('pickup exact input rejects malformed bounds, authority fields and executable values before IO', async () => {
  const e = harness([]), api = createTurnPickup(e.services, e.policy); let invoked = 0;
  for (const bad of [input({ maxScannedRows: 0 }), input({ maxScannedRows: 51 }), input({ maxWorkItems: 6 }), input({ maxElapsedMs: 999 }), input({ maxElapsedMs: 110001 }), input({ owner: 'foreign' }), input({ cursor: {} }), { get cursor() { invoked++; return null; } }])
    await assert.rejects(() => api.pickup({ owner: 'owner' }, bad));
  for (const bad of [{ owner: null }, {}, { owner: 'owner', admin: true }, { owner: '\ud800' }]) assert.throws(() => parsePickupBinding(bad));
  assert.throws(() => parsePickupInput(input({ maxWorkItems: NaN })));
  assert.equal(invoked, 0); assert.equal(e.calls.reads.length, 0);
});
test('pickup snapshots owner and cursor before asynchronous policy admission', async () => {
  const e = harness([hint(1)]), binding = { owner: 'owner' }, request = input(); let release;
  e.policy.open = async b => { assert.equal(b.owner, 'owner'); await new Promise(r => { release = r; }); return { authorize() {}, provider() { return {}; } }; };
  const pending = createTurnPickup(e.services, e.policy).pickup(binding, request);
  binding.owner = 'foreign'; request.cursor = { projectId: 'z', turnId: 'z' }; request.maxWorkItems = 0; release();
  assert.equal((await pending).complete, true); assert.equal(e.calls.work[0].binding.owner, 'owner');
});
test('filtered rows consume scan bounds and resume without dropping the next hint', async () => {
  const e = harness([{ ...hint(1), filtered: true }, hint(2)]), api = createTurnPickup(e.services, e.policy);
  const first = await api.pickup({ owner: 'owner' }, input({ maxScannedRows: 1 }));
  assert.equal(first.stopReason, 'scan-limit'); assert.equal(first.workItems, 0); assert.deepEqual(first.nextCursor, { projectId: 'p1', turnId: 't1' });
  const second = await api.pickup({ owner: 'owner' }, input({ cursor: first.nextCursor }));
  assert.equal(second.complete, true); assert.equal(second.workItems, 1); assert.equal(e.calls.work[0].binding.id, 'p2');
});
test('work limit records only completed positions and sequentially resumes', async () => {
  const e = harness([hint(1), hint(2)]), api = createTurnPickup(e.services, e.policy);
  const a = await api.pickup({ owner: 'owner' }, input({ maxWorkItems: 1 }));
  assert.equal(a.stopReason, 'work-limit'); assert.equal(a.completedItems, 1); assert.equal(e.calls.work.length, 1);
  const b = await api.pickup({ owner: 'owner' }, input({ cursor: a.nextCursor }));
  assert.equal(b.complete, true); assert.deepEqual(e.calls.work.map(x => x.binding.id), ['p1', 'p2']);
  assert.notEqual(e.calls.work[0].work.workerId, e.calls.work[1].work.workerId);
});
test('unfinished busy, lease, cancellation and step-limit positions are retained', async () => {
  for (const reason of ['busy', 'lease-lost', 'aborted', 'provider-required', 'step-limit']) {
    const e = harness([hint(1), hint(2)], { work: async () => result('approved', { phase: 'execute', reason, run: { status: 'running' } }) });
    const r = await createTurnPickup(e.services, e.policy).pickup({ owner: 'owner' }, input());
    assert.equal(r.complete, false); assert.equal(r.stopReason, reason); assert.equal(r.nextCursor, null); assert.equal(r.workItems, 1); assert.equal(r.completedItems, 0);
  }
});
test('canonical final state can complete despite a late abort reason', async () => {
  const e = harness([hint(1, 'approved')], { inspect: async () => ({ ok: true, turn: { state: 'approved' } }), work: async () => result('approved', { phase: 'execute', reason: 'aborted', advances: 1, run: { status: 'succeeded' } }) });
  const r = await createTurnPickup(e.services, e.policy).pickup({ owner: 'owner' }, input());
  assert.equal(r.complete, true); assert.equal(r.completedItems, 1); assert.equal(e.calls.providers, 0);
});
test('post-reconciliation submitted state prepares even when the raw hint was preparing', async () => {
  const e = harness([hint(1, 'preparing')]);
  assert.equal((await createTurnPickup(e.services, e.policy).pickup({ owner: 'owner' }, input())).complete, true);
  assert.equal(e.calls.providers, 1); assert.ok(e.calls.work[0].provider);
});
test('approved work needs neither provider configuration nor a secret lookup', async () => {
  const e = harness([hint(1, 'approved')], { inspect: async () => ({ ok: true, turn: { state: 'approved' } }), work: async (_b, _i, provider) => { assert.equal(provider, undefined); return result('approved', { phase: 'execute', advances: 1, run: { status: 'succeeded' } }); } }, { provider() { throw new Error('PRIVATE_KEY'); } });
  assert.equal((await createTurnPickup(e.services, e.policy).pickup({ owner: 'owner' }, input())).complete, true);
});
test('elapsed budget and external cancellation stop before another hint', async () => {
  let clock = 0;
  const e = harness([hint(1), hint(2)], { work: async () => { clock = 1000; return result(); } });
  const r = await createTurnPickup(e.services, e.policy, { now: () => clock }).pickup({ owner: 'owner' }, input({ maxElapsedMs: 1000 }));
  assert.equal(r.stopReason, 'time-limit'); assert.deepEqual(r.nextCursor, { projectId: 'p1', turnId: 't1' });
  const controller = new AbortController(); controller.abort();
  const before = e.calls.reads.length;
  assert.equal((await createTurnPickup(e.services, e.policy).pickup({ owner: 'owner' }, input(), { signal: controller.signal })).stopReason, 'aborted');
  assert.equal(e.calls.reads.length, before);
});
test('stale positions advance but infrastructure failure retains partial progress privately', async () => {
  let count = 0;
  const e = harness([hint(1), hint(2)], { inspect: async () => ++count === 1 ? { ok: false, code: 'not-found' } : Promise.reject(Object.assign(new Error('PRIVATE_SQL'), { code: 'storage-unavailable' })) });
  const r = await createTurnPickup(e.services, e.policy).pickup({ owner: 'owner' }, input());
  assert.equal(r.ok, false); assert.equal(r.stopReason, 'storage-unavailable'); assert.deepEqual(r.nextCursor, { projectId: 'p1', turnId: 't1' }); assert.equal(JSON.stringify(r).includes('PRIVATE'), false);
});
test('pickup output whitelists metadata and never exposes private worker bodies', async () => {
  const e = harness([{ ...hint(1), private: 'PRIVATE_HINT' }], { work: async () => result('awaiting-decision', { private: 'PRIVATE_WIRE', turn: { state: 'awaiting-decision', request: 'PRIVATE_REQUEST' } }) });
  const r = await createTurnPickup(e.services, e.policy).pickup({ owner: 'owner' }, input());
  assert.equal(r.ok, true); assert.equal(JSON.stringify(r).includes('PRIVATE'), false); assert.ok(Buffer.byteLength(JSON.stringify(r)) <= 131072);
});

const config = () => ({ id: 'auto', family: 'openai-compatible', model: 'operator-model', capabilities: caps(), baseURL: 'https://example.invalid/v1', sessionHeader: false });
function policyRig(changes = {}) {
  const calls = { account: 0, secrets: 0, reserves: [], settles: [], exchanges: 0 };
  let current = { id: 7, email: 'owner' };
  let reply = { ok: true, providerId: 'auto', family: 'openai-compatible', model: 'operator-model', outcome: 'text', text: 'Explanation.', calls: [], usage: { inputTokens: 42, outputTokens: 20, cacheReadInputTokens: 3, cacheWriteInputTokens: 4 } };
  const deps = { enabled: () => true, account: async () => { calls.account++; return current; }, readConfiguration: async () => config(), readSecret: async () => { calls.secrets++; return 'PRIVATE_KEY'; },
    reserveCall: (account, estimate) => { calls.reserves.push({ account, estimate }); return { allowed: true, eventId: calls.reserves.length }; },
    settleCall: (account, reservation, estimate, actual) => calls.settles.push({ account, reservation, estimate, actual }),
    transportFactory: () => ({ async exchange() { calls.exchanges++; return reply; } }), ...changes };
  return { policy: createAutoHostPolicy(deps), calls, owner: value => { current = value; }, reply: value => { reply = value; } };
}
test('host policy is default-closed and missing account/config never falls back', async () => {
  const e = policyRig({ enabled: () => false });
  await assert.rejects(() => e.policy.open({ owner: 'owner' }), { code: 'host-disabled' }); assert.equal(e.calls.account, 0); assert.equal(e.calls.secrets, 0);
  const missing = policyRig({ account: () => null }); await assert.rejects(() => missing.policy.open({ owner: 'owner' }), { code: 'owner-ineligible' });
  const bad = policyRig({ readConfiguration: () => ({ ...config(), id: 'other' }) });
  await assert.rejects(async () => (await bad.policy.open({ owner: 'owner' })).provider(), { code: 'host-misconfigured' }); assert.equal(bad.calls.secrets, 0);
});
test('explicit local Auto configuration pins model/capabilities without model discovery', () => {
  const host = { version: 1, model: 'operator-model', capabilities: caps() }, models = { providers: { auto: { type: 'openai-compatible', baseURL: 'https://example.invalid/v1', models: ['operator-model'] } } };
  assert.equal(parseAutoHostConfiguration(host, models).id, 'auto');
  for (const bad of [{ ...host, provider: 'BYOK' }, { ...host, model: 'unlisted' }, { ...host, capabilities: { ...caps(), toolCalling: false } }]) assert.throws(() => parseAutoHostConfiguration(bad, models), { code: 'host-misconfigured' });
  assert.throws(() => parseAutoHostConfiguration(host, { providers: { other: models.providers.auto } }), { code: 'host-misconfigured' });
});
test('owner deletion/recreation and revocation stop before reserve or network', async () => {
  const e = policyRig(), session = await e.policy.open({ owner: 'owner' }); e.owner({ id: 8, email: 'owner' });
  await assert.rejects(() => session.provider(), { code: 'owner-ineligible' }); assert.equal(e.calls.secrets, 0);
  const f = policyRig(), provider = await (await f.policy.open({ owner: 'owner' })).provider(), { context: ctx } = await context(); f.owner(null);
  assert.equal((await provider.exchange(ctx)).ok, false); assert.equal(f.calls.reserves.length, 0); assert.equal(f.calls.exchanges, 0);
});
test('known normalized usage settles input/output once without double-counting cache', async () => {
  const e = policyRig(), provider = await (await e.policy.open({ owner: 'owner' })).provider(), { context: ctx } = await context();
  assert.equal((await provider.exchange(ctx)).ok, true); assert.equal(e.calls.exchanges, 1); assert.equal(e.calls.reserves.length, 1);
  assert.ok(e.calls.reserves[0].estimate > 2048); assert.equal(e.calls.settles.length, 1); assert.equal(e.calls.settles[0].actual, 62); assert.equal(e.calls.settles[0].account.id, 7);
});
test('denied account admission produces zero provider calls', async () => {
  const e = policyRig({ reserveCall: () => ({ allowed: false }) }), provider = await (await e.policy.open({ owner: 'owner' })).provider(), { context: ctx } = await context();
  assert.equal((await provider.exchange(ctx)).code, 'rate-limited'); assert.equal(e.calls.exchanges, 0); assert.equal(e.calls.settles.length, 0);
});
test('unknown, malformed and cancelled outcomes retain conservative reservations', async () => {
  const { context: ctx } = await context();
  for (const outcome of ['unknown', 'malformed', 'timeout']) {
    const e = policyRig(), provider = await (await e.policy.open({ owner: 'owner' })).provider();
    e.reply(outcome === 'unknown' ? { ok: true, providerId: 'auto', family: 'openai-compatible', model: 'operator-model', outcome: 'text', text: 'Reply.', calls: [], usage: null } : outcome === 'timeout' ? providerFailure('timeout') : { ok: true, usage: 'PRIVATE_BAD' });
    const r = await provider.exchange(ctx); assert.equal(e.calls.reserves.length, 1); assert.equal(e.calls.settles.length, 0); assert.equal(JSON.stringify(r).includes('PRIVATE'), false);
  }
});
test('actual usage above reservation is recorded in full and closes further dispatch', async () => {
  const e = policyRig(), provider = await (await e.policy.open({ owner: 'owner' })).provider(), { context: ctx } = await context();
  e.reply({ ok: true, providerId: 'auto', family: 'openai-compatible', model: 'operator-model', outcome: 'text', text: 'Reply.', calls: [], usage: { inputTokens: 1000000, outputTokens: 20 } });
  assert.equal((await provider.exchange(ctx)).ok, true); assert.equal(e.calls.settles[0].actual, 1000020);
  assert.equal((await provider.exchange(ctx)).code, 'rate-limited'); assert.equal(e.calls.exchanges, 1); assert.equal(e.calls.reserves.length, 1);
});
test('settlement failure closes further dispatch without a retry or private error', async () => {
  const e = policyRig({ settleCall: () => { throw new Error('PRIVATE_DATABASE'); } }), provider = await (await e.policy.open({ owner: 'owner' })).provider(), { context: ctx } = await context();
  assert.equal((await provider.exchange(ctx)).code, 'provider-unavailable'); assert.equal((await provider.exchange(ctx)).code, 'rate-limited'); assert.equal(e.calls.exchanges, 1);
});
