import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { wakeScenario, productionApi, until } from './v2-host-wake-fixture.js';
import { installAgentBodyParser, registerV2AgentRoutes } from '../app/server/v2-agent-routes.js';
import { decision, submission } from './v2-turns-contract.js';
import { wire } from './v2-provider-fixture.js';

async function transport(t, e, service) {
  const names = ['FORGE_HOSTED', 'FORGE_AGENT_HOST_ENABLED', 'FORGE_AGENT_WAKE_ENABLED', 'FORGE_SMTP_HOST'];
  const previous = names.map(n => process.env[n]);
  Object.assign(process.env, { FORGE_HOSTED: '1', FORGE_AGENT_HOST_ENABLED: '1', FORGE_AGENT_WAKE_ENABLED: '1', FORGE_SMTP_HOST: '' });
  t.after(() => names.forEach((n, i) => { if (previous[i] === undefined) delete process.env[n]; else process.env[n] = previous[i]; }));
  const app = express(); installAgentBodyParser(app); app.use(express.json({ limit: '8mb' })); registerV2AgentRoutes(app, { service });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return (suffix = '/wake', options = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/v2/agent${suffix}`, {
    method: 'POST', body: '{}', ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.token}`, ...options.headers },
  });
}
test('wake HTTP binds private bearer identity and rejects cookie or supplied authority', { timeout: 15000 }, async t => {
  const e = await wakeScenario(t), seen = [];
  const call = await transport(t, e, () => ({ wake: async identity => { seen.push(identity); return { ok: true, status: 'accepted', secret: 'PRIVATE' }; } }));
  const accepted = await call(); assert.equal(accepted.status, 202); assert.deepEqual(await accepted.json(), { ok: true, status: 'accepted' });
  assert.deepEqual(seen, [e.identity]); assert.equal(accepted.headers.get('cache-control'), 'private, no-store');
  for (const options of [{ headers: { Authorization: '', Cookie: `token=${e.token}` } }, { headers: { Authorization: 'Bearer PRIVATE' } }]) {
    const r = await call('/wake', options); assert.equal(r.status, 401); assert.equal(JSON.stringify(await r.json()).includes('PRIVATE'), false);
  }
  for (const options of [{ body: '{"owner":"PRIVATE"}' }, { body: '{"userId":99}' }, { body: '{"cursor":null}' }, { body: '[]' }]) assert.equal((await call('/wake', options)).status, 400);
  assert.equal((await call('/wake?owner=PRIVATE')).status, 400); assert.equal(seen.length, 1);
});
test('wake private parser caps raw bytes and sanitizes malformed media and unknown routes', { timeout: 15000 }, async t => {
  const e = await wakeScenario(t); let calls = 0;
  const call = await transport(t, e, () => ({ wake: async () => { calls++; return { ok: true, status: 'accepted' }; } }));
  for (const [suffix, options, status] of [
    ['/wake', { body: ' '.repeat(1025) + '{}' }, 413], ['/wake', { body: '{PRIVATE' }, 400],
    ['/wake', { body: Buffer.from([0xff, 0xfe]) }, 400], ['/wake', { headers: { 'Content-Type': 'text/plain' } }, 415],
    ['/wake', { headers: { 'Content-Type': 'application/json;charset=iso-8859-1' } }, 415],
    ['/wake', { headers: { 'Content-Type': 'application/json;charset=utf-8;charset=utf-8' } }, 415],
    ['/wake', { headers: { 'Content-Encoding': 'gzip' } }, 415], ['/PRIVATE', {}, 404], ['/wake', { method: 'GET', body: undefined }, 404],
    ['/PRIVATE', { body: '{PRIVATE' }, 400],
  ]) {
    const r = await call(suffix, options); assert.equal(r.status, status); assert.equal(r.headers.get('cache-control'), 'private, no-store');
    assert.equal(JSON.stringify(await r.json()).includes('PRIVATE'), false);
  }
  assert.equal(calls, 0);
});
test('wake refusals expose only fixed status and bounded retry hints', { timeout: 15000 }, async t => {
  const e = await wakeScenario(t); let result;
  const call = await transport(t, e, () => ({ wake: async () => result }));
  for (const [value, status, code] of [[{ ok: false, code: 'wake-cooldown', retryAfter: 5 }, 429, 'wake-cooldown'], [{ ok: false, code: 'host-busy', retryAfter: 1 }, 503, 'host-busy'], [{ ok: false, code: 'PRIVATE', retryAfter: 999 }, 503, 'host-unavailable'], [{ ok: true, status: 'PRIVATE' }, 503, 'host-unavailable']]) {
    result = value; const r = await call(); assert.equal(r.status, status); assert.equal((await r.json()).code, code);
    assert.equal(r.headers.get('retry-after'), value.retryAfter <= 5 ? String(value.retryAfter) : null);
  }
  process.env.FORGE_AGENT_WAKE_ENABLED = '0'; assert.equal((await call()).status, 503);
});
test('production API defaults wake off with no provider dispatch', { timeout: 20000 }, async t => {
  const e = await wakeScenario(t); await e.submit(); const api = await productionApi(t, e, { FORGE_AGENT_WAKE_ENABLED: '0' });
  const r = await api.request('/api/v2/agent/wake', { method: 'POST', body: '{}' });
  assert.equal(r.status, 503); assert.equal((await r.json()).code, 'host-disabled'); assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0);
});
test('production wake survives client completion and reuses explicit submit/approval authority', { timeout: 20000 }, async t => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const e = await wakeScenario(t, { handler: async (_req, res) => { await pending; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(wire('openai-compatible'))); } });
  const api = await productionApi(t, e), route = `/api/v2/projects/${e.doc.id}/conversation`;
  const sent = await api.request(route + '/turns', { method: 'POST', body: JSON.stringify(submission(e, await e.service.read(e.binding))) });
  assert.equal(sent.status, 200); assert.equal(e.seen.length, 0);
  const response = await api.request('/api/v2/agent/wake', { method: 'POST', body: '{}' }); assert.equal(response.status, 202);
  await response.body.cancel(); await e.arrived; assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
  release(); await until(e.turn, turn => turn.state === 'awaiting-decision');
  const state = await e.service.read(e.binding), approved = await api.request(route + '/decisions', { method: 'POST', body: JSON.stringify(decision(state, state.turns[0])) });
  assert.equal(approved.status, 200); assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
  await api.stop();
  const restarted = await productionApi(t, e); assert.equal((await restarted.request('/api/v2/agent/wake', { method: 'POST', body: '{}' })).status, 202);
  await until(e.turn, turn => turn.run?.status === 'succeeded'); assert.equal((await e.store.getProject(e.binding)).doc.revision, 1);
  assert.equal(e.seen.length, 1); assert.equal(e.events().length, 1); assert.equal(e.events()[0].tokens, 62);
});
test('production process interruption preserves dispatched ambiguity and prevents automatic replay', { timeout: 20000 }, async t => {
  const e = await wakeScenario(t, { handler: () => {} }); await e.submit(); const api = await productionApi(t, e);
  assert.equal((await api.request('/api/v2/agent/wake', { method: 'POST', body: '{}' })).status, 202); await e.arrived;
  const reserved = e.events()[0].tokens; await api.stop();
  const row = e.db.prepare('SELECT id,payload FROM v2_agent_turns WHERE project_id=?').get(e.doc.id), meta = JSON.parse(row.payload);
  assert.equal(meta.everDispatched, true); meta.lease.until = meta.createdAt;
  e.db.prepare('UPDATE v2_agent_turns SET payload=? WHERE id=?').run(JSON.stringify(meta), row.id);
  const restarted = await productionApi(t, e); assert.equal((await restarted.request('/api/v2/agent/wake', { method: 'POST', body: '{}' })).status, 202);
  await until(e.turn, turn => turn.state === 'needs-user-action');
  assert.equal(e.seen.length, 1); assert.equal(e.events()[0].tokens, reserved); assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
});
