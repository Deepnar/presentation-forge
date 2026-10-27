import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { wakeScenario, productionApi } from './v2-host-wake-fixture.js';
import { assistantAvailability } from '../src/agent/assistant-availability.js';
const check = (name, fn) => test('Assistant integration: ' + name, { timeout: 20000 }, fn);
check('availability is owner-bound metadata with no provider/configuration work', async t => {
  const e = await wakeScenario(t); await e.submit();
  assert.deepEqual(await assistantAvailability(e.identity, e.doc.id, { backend: async () => e.store, enabled: () => false }), { ok: true, version: 1, enabled: false });
  const other = await e.store.createProject({ owner: 'other@forge.invalid', title: 'Private', scenes: e.doc.scenes });
  await assert.rejects(() => assistantAvailability(e.identity, other.doc.id, { backend: async () => e.store }), { code: 'not-found' });
  assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0);
});
check('availability pins account identity across asynchronous backend opening', async t => {
  const e = await wakeScenario(t);
  await assert.rejects(() => assistantAvailability(e.identity, e.doc.id, { backend: async () => {
    e.db.prepare('DELETE FROM users WHERE id=?').run(e.userId);
    e.db.prepare('INSERT INTO users(email,name,created_at,verified_at) VALUES(?,?,?,?)').run(e.owner, 'New', new Date().toISOString(), new Date().toISOString()); return e.store;
  } }), { code: 'owner-ineligible' }); assert.equal(e.seen.length, 0);
});
check('production availability is private default-off and cannot create a conversation or dispatch', async t => {
  const e = await wakeScenario(t), api = await productionApi(t, e, { FORGE_AGENT_WAKE_ENABLED: '0' }), route = `/api/v2/projects/${e.doc.id}/conversation`;
  const r = await api.request(route + '/availability'); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true, version: 1, enabled: false });
  assert.equal(r.headers.get('cache-control'), 'private, no-store'); assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0);
  const state = await api.request(route); assert.equal(state.status, 200); assert.equal((await state.json()).turns.length, 0);
});
check('production availability rejects anonymous cookie-only foreign and query authority', async t => {
  const e = await wakeScenario(t), api = await productionApi(t, e), route = `/api/v2/projects/${e.doc.id}/conversation/availability`;
  for (const headers of [{ Authorization: '' }, { Authorization: '', Cookie: `token=${e.token}` }]) assert.equal((await api.request(route, { headers })).status, 401);
  assert.equal((await api.request(route + '?provider=PRIVATE')).status, 400);
  const foreign = await e.store.createProject({ owner: 'foreign@forge.invalid', title: 'Private', scenes: e.doc.scenes });
  assert.equal((await api.request(route.replace(e.doc.id, foreign.doc.id))).status, 404);
  const good = await api.request(route); assert.deepEqual(await good.json(), { ok: true, version: 1, enabled: true }); assert.equal(e.seen.length, 0);
});
check('operator availability shares the projection and refuses execution overrides', async t => {
  const e = await wakeScenario(t);
  async function cli(extra = []) {
    const child = spawn(process.execPath, ['src/agent/turn-cli.js', 'availability', '--owner', e.owner, '--project', e.doc.id, ...extra], {
      env: { ...process.env, ...e.env, FORGE_HOSTED: '1', FORGE_AGENT_HOST_ENABLED: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); }); });
    assert.equal(result.signal, null); return { ...result, stdout, stderr };
  }
  const good = await cli(); assert.equal(good.code, 0); assert.deepEqual(JSON.parse(good.stdout), { ok: true, version: 1, enabled: false });
  const bad = await cli(['--provider', '/PRIVATE']); assert.equal(bad.code, 1); assert.equal(bad.stderr.includes('PRIVATE'), false); assert.equal(e.seen.length, 0);
});
