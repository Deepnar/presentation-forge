import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wakeScenario, until } from './v2-host-wake-fixture.js';
import { accountForBearerToken, userForToken } from '../src/auth.js';
import { createAutoHostPolicy } from '../src/agent/auto-host-policy.js';
import { decision, submission } from './v2-turns-contract.js';
import { expectedReview } from './v2-provider-contract.js';
import { wire } from './v2-provider-fixture.js';
const check = (name, body) => test('SQLite wake: ' + name, { timeout: 15000 }, body);
check('private bearer snapshot pins numeric session owner without changing public DTO', async t => {
  const e = await wakeScenario(t), snapshot = accountForBearerToken(e.token);
  assert.deepEqual(snapshot, { ...e.identity, verified: true }); assert.equal(Object.isFrozen(snapshot), true);
  const publicUser = await userForToken(e.token); assert.equal(Object.hasOwn(publicUser, 'userId'), false); assert.equal(Object.hasOwn(publicUser, 'id'), false);
  e.db.prepare('UPDATE sessions SET email=? WHERE token=?').run('foreign@forge.invalid', e.token);
  assert.equal(accountForBearerToken(e.token), null);
  e.db.prepare('UPDATE sessions SET email=?,last_used=? WHERE token=?').run(e.owner, '2000-01-01T00:00:00Z', e.token);
  assert.equal(accountForBearerToken(e.token), null); assert.equal(accountForBearerToken('bad-token'), null);
});
check('submit waits for wake, preparation waits for approval and execution persists exactly once', async t => {
  const e = await wakeScenario(t); await e.submit(); assert.equal(e.seen.length, 0);
  assert.deepEqual(await e.api.wake(e.identity), { ok: true, status: 'accepted' });
  await until(e.turn, s => s.state === 'awaiting-decision');
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 0); assert.equal(e.events()[0].tokens, 62);
  await e.api.close();
  const state = await e.service.read(e.binding); assert.equal((await e.service.decide(e.binding, decision(state, state.turns[0]))).ok, true);
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
  const noProvider = e.host({ policy: createAutoHostPolicy({ ...e.policyOptions, readSecret: () => { throw new Error('PRIVATE'); } }) });
  assert.equal((await noProvider.wake(e.identity)).ok, true);
  await until(e.turn, turn => turn.run?.status === 'succeeded');
  await noProvider.close(); await e.api.close(); await e.store.closeProjectStore();
  const reopened = (await e.store.getProject(e.binding)).doc; assert.deepEqual(reopened.scenes, expectedReview(e.doc));
  assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 2); assert.equal(e.seen.length, 1); assert.equal(e.events().length, 1);
  const replay = e.host(); await replay.wake(e.identity); await replay.close(); assert.equal((await e.store.getProject(e.binding)).doc.revision, 1);
});
check('another owner pending turn and account budget remain untouched', async t => {
  const e = await wakeScenario(t); await e.submit(); const owner = 'other@forge.invalid', now = new Date().toISOString();
  e.db.prepare('INSERT INTO users(email,name,created_at,verified_at) VALUES(?,?,?,?)').run(owner, 'Other', now, now);
  const { doc } = await e.store.createProject({ owner, title: 'Other', scenes: e.doc.scenes }), binding = { owner, id: doc.id };
  await e.service.submit(binding, submission({ ...e, doc }, await e.service.read(binding)));
  const before = await e.service.read(binding); await e.api.wake(e.identity); await until(e.turn, s => s.state === 'awaiting-decision');
  assert.deepEqual(await e.service.read(binding), before); assert.equal(e.events().length, 1); assert.equal(e.events()[0].user_id, e.userId);
});
check('deleted and recreated email cannot remap the authenticated snapshot during policy opening', async t => {
  const e = await wakeScenario(t), snapshot = accountForBearerToken(e.token), policy = createAutoHostPolicy(e.policyOptions);
  const api = e.host({ policy: { open: async binding => {
    const session = await policy.open(binding); e.db.prepare('DELETE FROM users WHERE id=?').run(e.userId);
    e.db.prepare('INSERT INTO users(email,name,created_at,verified_at) VALUES(?,?,?,?)').run(e.owner, 'Recreated', new Date().toISOString(), new Date().toISOString()); return session;
  } } });
  assert.equal((await api.wake({ owner: snapshot.owner, userId: snapshot.userId })).code, 'owner-ineligible');
  assert.equal(accountForBearerToken(e.token), null); assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0);
});
check('close cancels in-flight preparation, retains estimate and prevents restart replay', async t => {
  const e = await wakeScenario(t, { handler: () => {} }); await e.submit(); await e.api.wake(e.identity); await e.arrived;
  const reserved = e.events()[0].tokens; assert.ok(reserved > 0); assert.deepEqual(await e.api.close(), { drained: true });
  assert.equal((await e.turn()).state, 'cancelled'); assert.equal(e.events()[0].tokens, reserved); assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
  const resumed = e.host(); await resumed.wake(e.identity); await resumed.close(); assert.equal(e.seen.length, 1);
});
check('human save and clear during provider work survive detached completion', async t => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const e = await wakeScenario(t, { handler: async (_req, res) => { await pending; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(wire('openai-compatible'))); } });
  await e.submit(); await e.api.wake(e.identity); await e.arrived;
  const scenes = structuredClone(e.doc.scenes); scenes[0].elements[0].paragraphs[0].runs[0].text = 'Preserved human work';
  await e.store.saveProject({ ...e.binding, baseRevision: 0, scenes });
  const state = await e.service.read(e.binding); await e.service.clear(e.binding, { generation: state.generation, revision: state.revision });
  release(); await e.api.close(); assert.equal((await e.service.read(e.binding)).turns.length, 0);
  assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, scenes);
});
