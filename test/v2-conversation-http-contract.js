import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import express from 'express';
import JSZip from 'jszip';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { importApiFixture } from './v2-import-fixture.js';
import { seed } from './v2-tool-fixture.js';
import { spec } from './v2-runtime-fixture.js';
import { endpoint, wire } from './v2-provider-fixture.js';
import { reviewedEdit, expectedReview } from './v2-provider-contract.js';
import { submission, decision } from './v2-turns-contract.js';
import { setDbPathForTest } from '../src/db.js';
import { promoteToAdmin } from '../src/auth.js';
import { createTurnService } from '../packages/agent/turns.ts';
import { createRuntime } from '../packages/agent/runtime.ts';

export async function conversationHttpFixture(t, store, extraEnv = {}) {
  const f = await importApiFixture({
    FORGE_ADMIN_EMAIL: '', FORGE_ADMIN_PASSWORD: '', FORGE_OPEN_REGISTRATION: '1',
    ...extraEnv,
  });
  setDbPathForTest(f.env.FORGE_DB_PATH);
  t.after(async () => { await f.stop(); await store.closeProjectStore(); });
  const response = await f.request('/api/v2/projects', {
    token: f.token, method: 'POST', body: JSON.stringify({ title: 'Conversation HTTP', scenes: seed() }),
  });
  assert.equal(response.status, 200);
  const { project: doc } = await response.json();
  const binding = { owner: f.owner, id: doc.id }, service = createTurnService(store);
  const env = { ...f, store, binding, doc, plan: spec(), service, runtime: createRuntime(store) };
  const base = `/api/v2/projects/${doc.id}/conversation`;
  env.call = (suffix = '', options = {}) => f.request(base + suffix, { token: f.token, ...options });
  env.post = (suffix, body, options = {}) => env.call(suffix, { method: 'POST', body: JSON.stringify(body), ...options });
  env.proposed = async () => {
    const remote = await endpoint(t, 'openai-compatible', (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(wire('openai-compatible', [reviewedEdit()])));
    });
    const added = await service.submit(binding, submission(env, await service.read(binding)));
    assert.equal(added.ok, true);
    const ready = await service.prepare(binding, {
      generation: added.generation, revision: added.turn.revision, turnId: added.turn.id, workerId: 'trusted-http-fixture',
    }, remote.provider);
    assert.equal(ready.ok, true); assert.equal(ready.turn.state, 'awaiting-decision');
    return ready;
  };
  return env;
}

export function rawRequest(url, { method = 'GET', body = '', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method, headers: { 'Content-Length': Buffer.byteLength(body), ...headers } }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', part => { text += part; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text }));
    });
    request.on('error', reject); request.end(body);
  });
}

async function isolatedRouter(t, env, service) {
  const { installConversationBodyParser, registerV2ConversationRoutes } = await import('../app/server/v2-conversation-routes.js');
  const app = express(); installConversationBodyParser(app); app.use(express.json({ limit: '8mb' }));
  registerV2ConversationRoutes(app, { service });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}/api/v2/projects/${env.doc.id}/conversation`;
}

export function conversationHttpContract(label, setup) {
  const check = (name, run) => test(`${label} HTTP: ${name}`, { timeout: 45000 }, async t => run(t, await setup(t)));

  check('owner reads and exports only bounded visible state with private response headers', async (_t, e) => {
    await e.proposed();
    const read = await e.call(); assert.equal(read.status, 200);
    assert.equal(read.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await read.json(), await e.service.read(e.binding));
    const exported = await e.call('/export'); assert.equal(exported.status, 200);
    assert.equal(exported.headers.get('cache-control'), 'private, no-store');
    assert.match(exported.headers.get('content-type'), /^application\/json/);
    assert.match(exported.headers.get('content-disposition'), new RegExp(`attachment; filename="${e.doc.id}\\.conversation\\.json"`));
    const text = await exported.text(); assert.deepEqual(JSON.parse(text), await e.service.export(e.binding));
    for (const secret of ['fixture-private-key', 'Unrelated private slide', 'configurationDigest', 'instructionsVersion', '"private_payload"'])
      assert.equal(text.includes(secret), false, secret);
  });

  check('anonymous and nonowner access cannot read or change a conversation', async (_t, e) => {
    const p = await e.proposed(), before = await e.service.export(e.binding);
    for (const suffix of ['', '/export', '/decisions', '/cancel', '/clear']) {
      const body = suffix === '/cancel' ? { generation: p.generation, revision: p.revision, turnId: p.turn.id }
        : suffix === '/clear' ? { generation: p.generation, revision: p.revision } : decision(p, p.turn);
      const options = suffix && suffix !== '/export' ? { method: 'POST', body: JSON.stringify(body) } : {};
      for (const [token, status] of [[null, 401], [e.otherToken, 404]]) {
        const response = await e.call(suffix, { ...options, token });
        assert.equal(response.status, status, suffix);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        const text = await response.text(); assert.equal(text.includes(p.turn.request), false);
      }
    }
    assert.deepEqual(await e.service.export(e.binding), before);
  });

  check('project administrator privileges do not grant cross-owner private chat access', async (_t, e) => {
    const created = await e.request('/api/v2/projects', { token: e.otherToken, method: 'POST', body: JSON.stringify({ title: 'Other owner', scenes: seed() }) }).then(r => r.json());
    assert.equal(created.ok, true);
    const other = { owner: 'import-other@example.test', id: created.project.id };
    const before = await e.service.export(other);
    await promoteToAdmin(e.owner);
    assert.equal((await e.request('/api/auth/me', { token: e.token }).then(r => r.json())).user.role, 'admin');
    assert.equal((await e.request(`/api/v2/projects/${other.id}`, { token: e.token })).status, 200);
    for (const suffix of ['', '/export', '/clear']) {
      const response = await e.request(`/api/v2/projects/${other.id}/conversation${suffix}`, { token: e.token, ...(suffix === '/clear' ? { method: 'POST', body: JSON.stringify({ generation: before.generation, revision: before.revision }) } : {}) });
      assert.equal(response.status, 404);
    }
    assert.deepEqual(await e.service.export(other), before);
  });

  check('pagination is exact and rejects repeated, bracketed or nondecimal inputs', async (_t, e) => {
    for (let i = 0; i < 21; i++) {
      const added = await e.service.submit(e.binding, submission(e, await e.service.read(e.binding), { request: `Visible message ${i}` }));
      assert.equal(added.ok, true);
      await e.service.cancel(e.binding, { generation: added.generation, revision: added.revision, turnId: added.turn.id });
    }
    const all = await e.service.export(e.binding), first = await e.call().then(r => r.json());
    assert.equal(first.total, 21); assert.deepEqual(first.turns, all.turns.slice(0, 20));
    assert.deepEqual((await e.call('?offset=20&limit=1').then(r => r.json())).turns, all.turns.slice(20));
    for (const query of ['?offset=-1', '?offset=01', '?offset=129', '?offset=0&offset=1', '?limit=0', '?limit=21', '?limit[]=1', '?limit=1e1', '?owner=x', '?offset='])
      assert.equal((await e.call(query)).status, 400, query);
    assert.equal((await e.call('/export?offset=0')).status, 400);
  });

  check('authority and execution payloads cannot replace the stored decision identity', async (_t, e) => {
    const p = await e.proposed(), input = decision(p, p.turn), before = await e.service.export(e.binding);
    for (const extra of [{ owner: e.owner }, { admin: true }, { edits: [] }, { runId: 'chosen-run' }, { provider: { apiKey: 'secret' } }]) {
      assert.equal((await e.post('/decisions', { ...input, ...extra })).status, 422);
    }
    assert.equal((await e.post('/decisions?owner=x', input)).status, 400);
    assert.deepEqual(await e.service.export(e.binding), before);
    for (const suffix of ['/submit', '/prepare', '/claim', '/advance']) assert.equal((await e.post(suffix, input)).status, 404);
  });

  check('private parser bounds and failures are sanitized before the shared parser', async (_t, e) => {
    const url = e.base + `/api/v2/projects/${e.doc.id}/conversation/clear`;
    const headers = { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' };
    for (const [body, status] of [['{"secret":"DO_NOT_ECHO",', 400], [JSON.stringify({ message: '界'.repeat(3000) }), 413]]) {
      const response = await rawRequest(url, { method: 'POST', body, headers });
      assert.equal(response.status, status); assert.equal(response.headers['cache-control'], 'private, no-store');
      assert.equal(response.text.includes('DO_NOT_ECHO'), false); assert.equal(response.text.includes('界'), false);
      assert.equal(JSON.parse(response.text).ok, false);
    }
    assert.equal((await e.call('/clear', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
    assert.equal((await rawRequest(e.base + `/api/v2/projects/${e.doc.id}/conversation`, { body: '{}', headers })).status, 400);
    const invalidPath = await rawRequest(e.base + '/api/v2/projects/DO_NOT_ECHO%E0%A4%A/conversation', { headers });
    assert.equal(invalidPath.status, 400);
    assert.equal(invalidPath.headers['cache-control'], 'private, no-store');
    assert.equal(invalidPath.text.includes('DO_NOT_ECHO'), false);
    assert.equal(JSON.parse(invalidPath.text).code, 'invalid-request');
  });

  check('HTTP approval reopens one canonical run and preserves edits, styling and history', async (_t, e) => {
    const p = await e.proposed(), input = decision(p, p.turn);
    const approved = await e.post('/decisions', input).then(r => r.json());
    assert.equal(approved.ok, true); assert.equal(approved.turn.run.status, 'queued');
    const run = approved.turn.run, claim = await e.runtime.claim(e.binding, run.id, 'canonical-host');
    assert.equal(claim.ok, true); assert.equal((await e.runtime.advance(e.binding, run.id, claim.lease)).run.status, 'succeeded');
    const replay = await e.post('/decisions', input).then(r => r.json());
    assert.equal(replay.turn.run.id, run.id); assert.equal(replay.turn.run.status, 'succeeded');
    assert.equal((await e.post('/decisions', { ...input, decision: 'reject' })).status, 409);
    assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, expectedReview(e.doc));
    assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 2);
    const exported = await e.request(`/api/v2/projects/${e.doc.id}/export.pptx`, { token: e.token });
    assert.equal(exported.status, 200);
    const bytes = Buffer.from(await exported.arrayBuffer()), archive = await JSZip.loadAsync(bytes);
    const slide = await archive.file('ppt/slides/slide1.xml').async('string');
    const chart = await archive.file('ppt/charts/chart1.xml').async('string');
    assert.ok(slide.includes('Reviewed ') && slide.includes('<a:tbl>') && slide.includes('15.75'));
    assert.ok(chart.includes('Reviewed score') && chart.includes('15.75'));
    if (process.env.FORGE_HTTP_EVIDENCE_DIR) {
      const directory = process.env.FORGE_HTTP_EVIDENCE_DIR;
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, `${label.toLowerCase()}-approved.pptx`), bytes);
    }
    const restored = await e.store.restoreRevision({ ...e.binding, baseRevision: 1, targetRevision: 0 });
    assert.deepEqual(restored.doc.scenes, e.doc.scenes);
  });

  check('rejection is durable and cannot create or replace a queued run', async (_t, e) => {
    const p = await e.proposed(), input = decision(p, p.turn, { decision: 'reject' });
    const result = await e.post('/decisions', input).then(r => r.json());
    assert.equal(result.turn.state, 'rejected'); assert.equal(result.turn.run, null);
    assert.equal((await e.post('/decisions', input).then(r => r.json())).turn.state, 'rejected');
    assert.equal((await e.post('/decisions', { ...input, decision: 'approve' })).status, 409);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
  });

  check('HTTP cancellation fences a claimed run before its edit can commit', async (_t, e) => {
    const p = await e.proposed(), q = await e.post('/decisions', decision(p, p.turn)).then(r => r.json());
    const claim = await e.runtime.claim(e.binding, q.turn.run.id, 'cancelled-host');
    const state = await e.service.read(e.binding), input = { generation: state.generation, revision: state.revision, turnId: p.turn.id };
    const result = await e.post('/cancel', input).then(r => r.json());
    assert.equal(result.turn.run.status, 'cancelled');
    assert.equal((await e.runtime.advance(e.binding, q.turn.run.id, claim.lease)).code, 'terminal');
    assert.equal((await e.post('/cancel', input).then(r => r.json())).turn.state, 'cancelled');
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
  });

  check('HTTP clear preserves committed deck/history/accounting and invalidates prior approvals', async (_t, e) => {
    const p = await e.proposed(), input = decision(p, p.turn), q = await e.post('/decisions', input).then(r => r.json());
    const claim = await e.runtime.claim(e.binding, q.turn.run.id, 'clear-host');
    await e.runtime.advance(e.binding, q.turn.run.id, claim.lease);
    const doc = (await e.store.getProject(e.binding)).doc, history = await e.store.listRevisions(e.binding), before = await e.service.read(e.binding);
    const cleared = await e.post('/clear', { generation: before.generation, revision: before.revision }).then(r => r.json());
    assert.equal(cleared.ok, true); assert.notEqual(cleared.generation, before.generation);
    assert.equal((await e.post('/decisions', input)).status, 409);
    const after = await e.call().then(r => r.json()); assert.deepEqual(after.turns, []); assert.deepEqual(after.accounting, before.accounting);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, doc); assert.deepEqual(await e.store.listRevisions(e.binding), history);
  });

  check('a newer human save refuses stale approval without losing the pending proposal', async (_t, e) => {
    const p = await e.proposed(), scenes = structuredClone(e.doc.scenes); scenes[0].elements[0].paragraphs[0].runs[0].text = 'Human saved first';
    const saved = await e.store.saveProject({ ...e.binding, baseRevision: 0, scenes });
    const refused = await e.post('/decisions', decision(p, p.turn));
    assert.equal(refused.status, 409); assert.equal((await refused.json()).code, 'stale-project');
    assert.equal((await e.call().then(r => r.json())).turns[0].state, 'awaiting-decision');
    assert.deepEqual((await e.store.getProject(e.binding)).doc, saved.doc);
  });

  check('logout revokes the next request and deleted projects remain absent', async (_t, e) => {
    const p = await e.proposed(); await e.store.deleteProject(e.binding);
    assert.equal((await e.call()).status, 404);
    assert.equal((await e.post('/decisions', decision(p, p.turn))).status, 404);
    await e.request('/api/auth/logout', { token: e.token, method: 'POST', body: '{}' });
    assert.equal((await e.call()).status, 401);
  });

  check('project ownership changes revoke the previous owner on every operation', async (_t, e) => {
    const p = await e.proposed();
    await e.store.withRuntimeTransaction(e.binding, tx => tx.query('UPDATE v2_projects SET owner=? WHERE id=?', ['import-other@example.test', e.doc.id]));
    for (const suffix of ['', '/export', '/decisions', '/cancel', '/clear']) {
      const body = suffix === '/cancel' ? { generation: p.generation, revision: p.revision, turnId: p.turn.id }
        : suffix === '/clear' ? { generation: p.generation, revision: p.revision } : decision(p, p.turn);
      const response = await e.call(suffix, suffix && suffix !== '/export' ? { method: 'POST', body: JSON.stringify(body) } : {});
      assert.equal(response.status, 404, suffix);
    }
    assert.equal((await e.call('', { token: e.otherToken })).status, 200);
  });

  check('lost HTTP response preserves the original committed decision for replay', async (t, e) => {
    const p = await e.proposed(), input = decision(p, p.turn); let committed, release;
    const arrived = new Promise(resolve => { committed = resolve; }), finish = new Promise(resolve => { release = resolve; });
    let first = true;
    const base = await isolatedRouter(t, e, async () => ({ ...e.service, decide: async (...args) => {
      const result = await e.service.decide(...args);
      if (first) { first = false; committed(result); await finish; }
      return result;
    } }));
    const controller = new AbortController();
    const response = fetch(base + '/decisions', { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const original = await arrived; assert.equal(original.ok, true); controller.abort(); release();
    await assert.rejects(response, { name: 'AbortError' });
    const retry = await e.post('/decisions', input).then(r => r.json());
    assert.equal(retry.turn.run.id, original.turn.run.id);
    const count = await e.store.withRuntimeTransaction(e.binding, async tx => (await tx.query('SELECT id FROM v2_agent_runs WHERE project_id=?', [e.doc.id])).length);
    assert.equal(count, 1);
  });

  check('unexpected host errors are sanitized and final expiry fencing maps to conflict', async (t, e) => {
    for (const [error, status, code] of [
      [Object.assign(new Error('PRIVATE_SQL_CONNECTION_SECRET'), { code: 'storage-unavailable' }), 503, 'storage-unavailable'],
      [Object.assign(new Error('PRIVATE_APPROVAL_CONTENT'), { code: 'invalid-document', turnCode: 'approval-expired' }), 409, 'approval-expired'],
      [new Error('PRIVATE_INTERNAL_SECRET'), 500, 'request-failed'],
    ]) {
      const base = await isolatedRouter(t, e, async () => { throw error; });
      const response = await fetch(base, { headers: { Authorization: `Bearer ${e.token}` } });
      assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const text = await response.text(); assert.equal(text.includes('PRIVATE_'), false); assert.equal(JSON.parse(text).code, code);
    }
  });
}
