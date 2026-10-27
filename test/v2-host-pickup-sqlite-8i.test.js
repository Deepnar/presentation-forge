import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostScenario, pickupInput } from './v2-host-pickup-fixture.js';
import { decision, submission } from './v2-turns-contract.js';
import { expectedReview } from './v2-provider-contract.js';
import { wire } from './v2-provider-fixture.js';
import { createAutoHostPolicy } from '../src/agent/auto-host-policy.js';
import { createAutoHostPickup } from '../src/agent/host-pickup.js';

const check = (name, body) => test('SQLite host: ' + name, { timeout: 20000 }, body);
check('submit prepares, waits for explicit approval, executes and reopens one revision', async t => {
  const e = await hostScenario(t), submitted = await e.submit(); assert.equal(submitted.ok, true);
  const prepared = await e.pickup().pickup({ owner: e.owner }, pickupInput());
  assert.equal(prepared.ok, true, JSON.stringify(prepared)); assert.equal(prepared.complete, true); assert.equal(prepared.results[0].turnState, 'awaiting-decision');
  assert.equal(e.seen.length, 1); assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, e.doc.scenes);
  assert.deepEqual(e.events().map(x => ({ ...x })), [{ user_id: e.userId, provider: 'auto', tokens: 62 }]); assert.equal(e.lifetime(), 62);
  const state = await e.service.read(e.binding), queued = await e.service.decide(e.binding, decision(state, state.turns[0])); assert.equal(queued.ok, true);
  const noProvider = { ...e.policyOptions, readConfiguration: () => { throw new Error('PRIVATE_CONFIG'); }, readSecret: () => { throw new Error('PRIVATE_KEY'); } };
  const api = createAutoHostPickup(e.store, createAutoHostPolicy(noProvider));
  const executed = await api.pickup({ owner: e.owner }, pickupInput());
  assert.equal(executed.complete, true); assert.equal(executed.results[0].runStatus, 'succeeded');
  await e.store.closeProjectStore();
  const after = (await e.store.getProject(e.binding)).doc; assert.equal(after.revision, 1); assert.deepEqual(after.scenes, expectedReview(e.doc));
  assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 2);
  const replay = await api.pickup({ owner: e.owner }, pickupInput()); assert.equal(replay.results[0].runStatus, 'succeeded');
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 1); assert.equal(e.events().length, 1); assert.equal(e.seen.length, 1);
  assert.equal(JSON.stringify(executed).includes('fixture-private-key'), false);
});
check('two owners retain separate account spending and pending work', async t => {
  const e = await hostScenario(t); await e.submit();
  e.db.prepare('INSERT INTO users(email,name,created_at,verified_at) VALUES(?,?,?,?)').run('other@forge.invalid', 'Other', new Date().toISOString(), new Date().toISOString());
  const { doc } = await e.store.createProject({ owner: 'other@forge.invalid', title: 'Other', scenes: e.doc.scenes });
  const other = { owner: 'other@forge.invalid', id: doc.id }, before = await e.store.getProject(other);
  await e.service.submit(other, submission({ ...e, doc }, await e.service.read(other)));
  const otherChat = await e.service.read(other);
  const missing = await e.pickup().pickup({ owner: 'missing@forge.invalid' }, pickupInput()); assert.equal(missing.stopReason, 'owner-ineligible'); assert.equal(e.seen.length, 0);
  assert.equal((await e.pickup().pickup({ owner: e.owner }, pickupInput())).ok, true);
  assert.deepEqual(await e.store.getProject(other), before); assert.deepEqual(await e.service.read(other), otherChat); assert.equal(e.events()[0].user_id, e.userId);
  assert.equal(e.db.prepare('SELECT lifetime_tokens FROM users WHERE email=?').get(other.owner).lifetime_tokens, 0);
});
check('account token refusal reserves no event and causes no HTTP call', async t => {
  const e = await hostScenario(t); await e.submit();
  e.db.prepare('UPDATE users SET lifetime_tokens=999999999 WHERE id=?').run(e.userId);
  const r = await e.pickup().pickup({ owner: e.owner }, pickupInput());
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.results[0].turnState, 'refused'); assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0);
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
});
check('unknown response usage keeps the full positive account estimate', async t => {
  const e = await hostScenario(t, { handler: (_req, res) => { const raw = wire('openai-compatible'); delete raw.usage; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(raw)); } });
  await e.submit(); const r = await e.pickup().pickup({ owner: e.owner }, pickupInput()); assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(e.events().length, 1); assert.ok(e.events()[0].tokens > 2048); assert.equal(e.lifetime(), e.events()[0].tokens);
  const state = await e.service.read(e.binding); assert.equal(state.accounting.unknownAttempts, 1); assert.equal(e.seen.length, 1);
});
check('settlement rolls back event and lifetime counters together on an injected SQLite fault', async t => {
  const e = await hostScenario(t); await e.submit();
  e.db.exec("CREATE TRIGGER reject_host_settlement BEFORE UPDATE OF lifetime_tokens ON users WHEN NEW.lifetime_tokens < OLD.lifetime_tokens BEGIN SELECT RAISE(ABORT,'PRIVATE_SETTLEMENT'); END");
  const r = await e.pickup().pickup({ owner: e.owner }, pickupInput());
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(e.seen.length, 1); assert.equal(e.events().length, 1);
  assert.ok(e.events()[0].tokens > 2048); assert.equal(e.events()[0].tokens, e.lifetime()); assert.equal(JSON.stringify(r).includes('PRIVATE'), false);
  const current = (await e.service.read(e.binding)).turns[0]; assert.equal(current.state, 'refused'); assert.equal(current.code, 'provider-error');
});
for (const dispatched of [false, true]) check(dispatched ? 'ambiguous dispatch never retries' : 'safe pre-dispatch lease recovery prepares', async t => {
    const e = await hostScenario(t); await e.submit();
    const row = e.db.prepare('SELECT id,payload FROM v2_agent_turns WHERE project_id=?').get(e.doc.id), meta = JSON.parse(row.payload);
    Object.assign(meta, { state: 'preparing', fence: 1, everDispatched: dispatched, lease: { workerId: 'lost-worker', until: meta.createdAt } });
    e.db.prepare('UPDATE v2_agent_turns SET payload=? WHERE id=?').run(JSON.stringify(meta), row.id);
    const r = await e.pickup().pickup({ owner: e.owner }, pickupInput()); assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(e.seen.length, dispatched ? 0 : 1);
    assert.equal((await e.service.read(e.binding)).turns[0].state, dispatched ? 'needs-user-action' : 'awaiting-decision');
});
check('human saves and cleared generations remain authoritative during pickup', async t => {
  const e = await hostScenario(t, { handler: async (_req, res) => {
    const scenes = structuredClone(e.doc.scenes); scenes[0].elements[0].paragraphs[0].runs[0].text = 'Human kept this';
    await e.store.saveProject({ ...e.binding, baseRevision: 0, scenes });
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(wire('openai-compatible')));
  } });
  await e.submit(); const r = await e.pickup().pickup({ owner: e.owner }, pickupInput()); assert.equal(r.ok, true, JSON.stringify(r));
  const saved = (await e.store.getProject(e.binding)).doc; assert.equal(saved.scenes[0].elements[0].paragraphs[0].runs[0].text, 'Human kept this');
  const state = await e.service.read(e.binding); assert.notEqual(state.turns[0].state, 'approved');
  await e.service.clear(e.binding, { generation: state.generation, revision: state.revision });
  assert.equal((await e.pickup().pickup({ owner: e.owner }, pickupInput())).workItems, 0); assert.deepEqual((await e.store.getProject(e.binding)).doc, saved);
});
