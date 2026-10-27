import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { wakeScenario, productionApi, until } from './v2-host-wake-fixture.js';
import { lookup, targetRequest } from './v2-target-wake-fixture.js';
import { installTargetWakeBodyParser, registerV2TargetWakeRoute } from '../app/server/v2-agent-routes.js';
import { installConversationBodyParser, registerV2ConversationRoutes } from '../app/server/v2-conversation-routes.js';
import { decision, submission } from './v2-turns-contract.js';
async function transport(t, e, service = () => e.api) {
  const names = ['FORGE_HOSTED', 'FORGE_AGENT_HOST_ENABLED', 'FORGE_AGENT_WAKE_ENABLED', 'FORGE_SMTP_HOST'];
  const previous = names.map(n => process.env[n]); Object.assign(process.env, { FORGE_HOSTED: '1', FORGE_AGENT_HOST_ENABLED: '1', FORGE_AGENT_WAKE_ENABLED: '1', FORGE_SMTP_HOST: '' });
  t.after(() => names.forEach((n, i) => { if (previous[i] === undefined) delete process.env[n]; else process.env[n] = previous[i]; }));
  const app = express(); installTargetWakeBodyParser(app); installConversationBodyParser(app); app.use(express.json({ limit: '8mb' }));
  registerV2TargetWakeRoute(app, { service }); registerV2ConversationRoutes(app);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  return (suffix = '/wake', options = {}, project = e.doc.id) => fetch(`http://127.0.0.1:${server.address().port}/api/v2/projects/${project}/conversation${suffix}`, {
    method: 'POST', ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.token}`, ...options.headers },
  });
}
test('target HTTP binds project and private bearer without accepting supplied authority', { timeout: 15000 }, async t => {
  const e = await wakeScenario(t), input = lookup(await e.submit()), seen = [];
  const call = await transport(t, e, () => ({ wake: async value => { seen.push(value); return { ok: true, status: 'accepted', secret: 'PRIVATE' }; } }));
  const r = await call('/wake', { body: JSON.stringify(input) }); assert.equal(r.status, 202); assert.deepEqual(await r.json(), { ok: true, status: 'accepted' });
  assert.deepEqual(seen, [targetRequest(e, input)]);
  for (const options of [{ headers: { Authorization: '', Cookie: `token=${e.token}` } }, { headers: { Authorization: 'Bearer PRIVATE' } }]) assert.equal((await call('/wake', { body: JSON.stringify(input), ...options })).status, 401);
  for (const extra of [{ owner: 'PRIVATE' }, { userId: 99 }, { workerId: 'PRIVATE' }, { provider: {} }, { projectId: 'other' }, { decision: 'approve' }]) assert.equal((await call('/wake', { body: JSON.stringify({ ...input, ...extra }) })).status, 400);
  assert.equal((await call('/wake?owner=PRIVATE', { body: JSON.stringify(input) })).status, 400); assert.equal(seen.length, 1);
});
test('target strict 2048-byte parser precedes conversation and generic budgets', { timeout: 15000 }, async t => {
  const e = await wakeScenario(t); let calls = 0;
  const call = await transport(t, e, () => ({ wake: async () => { calls++; return { ok: true, status: 'accepted' }; } }));
  for (const [suffix, options, status, project] of [
    ['/wake', { body: ' '.repeat(2049) + '{}' }, 413], ['/wake', { body: '{PRIVATE' }, 400],
    ['/wake', { body: Buffer.from([0xff, 0xfe]) }, 400], ['/wake', { body: '{}', headers: { 'Content-Encoding': 'gzip' } }, 415],
    ['/wake', { body: '{}', headers: { 'Content-Type': 'text/plain' } }, 415],
    ['/wake', { body: '{}', headers: { 'Content-Type': 'application/json;charset=utf-8;charset=utf-8' } }, 415],
    ['/wake', { body: '{}', headers: { 'Content-Type': 'application/json;charset=latin1' } }, 415],
    ['/PRIVATE', { body: '{}' }, 404], ['/wake', { method: 'GET' }, 404], ['/wake', { body: '{}' }, 400, '%E0%A4%A'],
  ]) {
    const r = await call(suffix, options, project); assert.equal(r.status, status); assert.equal(r.headers.get('cache-control'), 'private, no-store'); assert.equal(JSON.stringify(await r.json()).includes('PRIVATE'), false);
  }
  assert.equal(calls, 0);
});
test('target HTTP reports missing foreign stale and busy safely through actual coordinator', { timeout: 15000 }, async t => {
  const e = await wakeScenario(t), input = lookup(await e.submit()); const call = await transport(t, e);
  assert.equal((await call('/wake', { body: JSON.stringify({ ...input, turnId: 'missing' }) })).status, 404); e.advance();
  assert.equal((await call('/wake', { body: JSON.stringify({ ...input, generation: 'stale' }) })).status, 409); e.advance();
  const other = await e.store.createProject({ owner: 'foreign@forge.invalid', title: 'Private', scenes: e.doc.scenes });
  assert.equal((await call('/wake', { body: JSON.stringify(input) }, other.doc.id)).status, 404);
  process.env.FORGE_AGENT_WAKE_ENABLED = '0'; assert.equal((await call('/wake', { body: JSON.stringify(input) })).status, 503); assert.equal(e.seen.length, 0);
});
test('target HTTP returns busy retry for a different active target while admission is pending', { timeout: 15000 }, async t => {
  const e = await wakeScenario(t); let release; const pending = new Promise(r => { release = r; }); t.after(() => release());
  const api = e.host({ policy: { open: async () => { await pending; throw Object.assign(new Error(), { code: 'host-disabled' }); } } });
  const call = await transport(t, e, () => api), input = lookup(await e.submit());
  const first = call('/wake', { body: JSON.stringify(input) }); await new Promise(r => setTimeout(r, 30));
  const busy = await call('/wake', { body: JSON.stringify({ ...input, turnId: 'other' }) });
  assert.equal(busy.status, 503); assert.equal((await busy.json()).code, 'host-busy'); assert.equal(busy.headers.get('retry-after'), '1');
  release(); assert.equal((await first).status, 503);
});
test('production target defaults off and preserves submission parser registration', { timeout: 20000 }, async t => {
  const e = await wakeScenario(t), api = await productionApi(t, e, { FORGE_AGENT_WAKE_ENABLED: '0' }), route = `/api/v2/projects/${e.doc.id}/conversation`;
  const sent = await api.request(route + '/turns', { method: 'POST', body: JSON.stringify(submission(e, await e.service.read(e.binding))) });
  assert.equal(sent.status, 200); const body = await sent.json();
  const r = await api.request(route + '/wake', { method: 'POST', body: JSON.stringify(lookup(body)) }); assert.equal(r.status, 503); assert.equal((await r.json()).code, 'host-disabled');
  assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0);
});
test('production target prepare and restarted approved execution persist without owner wake', { timeout: 25000 }, async t => {
  const e = await wakeScenario(t), input = lookup(await e.submit()), api = await productionApi(t, e), route = `/api/v2/projects/${e.doc.id}/conversation`;
  const r = await api.request(route + '/wake', { method: 'POST', body: JSON.stringify(input) }); assert.equal(r.status, 202); await r.body.cancel();
  await until(e.turn, v => v.state === 'awaiting-decision');
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
  const state = await e.service.read(e.binding); assert.equal((await api.request(route + '/decisions', { method: 'POST', body: JSON.stringify(decision(state, state.turns[0])) })).status, 200);
  await api.stop(); const restarted = await productionApi(t, e);
  assert.equal((await restarted.request(route + '/wake', { method: 'POST', body: JSON.stringify(input) })).status, 202);
  await until(e.turn, v => v.run?.status === 'succeeded'); assert.equal((await e.store.getProject(e.binding)).doc.revision, 1);
  assert.equal(e.seen.length, 1); assert.equal(e.events().length, 1); assert.equal(e.lifetime(), 62);
});
