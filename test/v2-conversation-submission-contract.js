import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { promoteToAdmin } from '../src/auth.js';
import { createTurnWorker } from '../packages/agent/turn-worker.ts';
import { TURN_LIMITS } from '../packages/agent/turn-state.ts';
import { submission, decision } from './v2-turns-contract.js';
import { isolatedRouter, rawRequest } from './v2-conversation-http-contract.js';
import { endpoint, wire } from './v2-provider-fixture.js';
import { reviewedEdit, expectedReview } from './v2-provider-contract.js';
import { seed } from './v2-tool-fixture.js';

async function unchanged(e, before) {
  assert.deepEqual(await e.service.export(e.binding), before);
  assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
  assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 1);
}

async function noExecution(e) {
  await e.store.withRuntimeTransaction(e.binding, async tx => {
    for (const table of ['runs', 'proposals', 'attempts']) {
      assert.equal((await tx.query(`SELECT id FROM v2_agent_${table} WHERE project_id=?`, [e.doc.id])).length, 0);
    }
  });
}

async function refused(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const text = await response.text();
  assert.equal(text.includes('PRIVATE_'), false);
  const body = JSON.parse(text);
  assert.equal(body.ok, false);
  assert.equal(body.code, code);
}

export function conversationSubmissionContract(label, setup) {
  const check = (name, run) => test(`${label} submission HTTP: ${name}`, { timeout: 90000 }, async t => run(t, await setup(t)));

  check('persists one visible turn without dispatching, proposing, queueing or editing', async (_t, e) => {
    const state = await e.service.read(e.binding), input = submission(e, state);
    const response = await e.post('/turns', input);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.turn.state, 'submitted');
    assert.equal(result.turn.request, input.request);
    assert.equal(result.turn.proposal, null);
    assert.equal(result.turn.run, null);
    assert.equal(result.revision, state.revision + 1);
    assert.deepEqual(result, await e.service.inspect(e.binding, { generation: result.generation, turnId: result.turn.id }));
    const saved = await e.call('/export').then(r => r.json());
    assert.equal(saved.turns.length, 1);
    assert.deepEqual(saved.turns[0], result.turn);
    assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
    assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 1);
    await noExecution(e);
  });

  check('concurrent matching replay reuses one saved turn and current-view replay survives cancellation', async (_t, e) => {
    const input = submission(e, await e.service.read(e.binding));
    const results = await Promise.all([e.post('/turns', input), e.post('/turns', input)]);
    assert.deepEqual(results.map(r => r.status), [200, 200]);
    const [a, b] = await Promise.all(results.map(r => r.json()));
    assert.equal(a.turn.id, b.turn.id);
    assert.equal((await e.service.export(e.binding)).turns.length, 1);
    await refused(await e.post('/turns', { ...input, request: 'PRIVATE_CHANGED_IDENTITY' }), 409, 'conflicting-request');
    const state = await e.service.read(e.binding);
    await refused(await e.post('/turns', submission(e, state)), 409, 'busy');
    const cancelled = await e.post('/cancel', { generation: state.generation, revision: state.revision, turnId: a.turn.id }).then(r => r.json());
    assert.equal(cancelled.turn.state, 'cancelled');
    const replay = await e.post('/turns', input).then(r => r.json());
    assert.equal(replay.turn.id, a.turn.id);
    assert.equal(replay.turn.state, 'cancelled');
    await noExecution(e);
  });

  check('distinct concurrent requests cannot admit two active turns', async (_t, e) => {
    const state = await e.service.read(e.binding);
    const responses = await Promise.all([e.post('/turns', submission(e, state)), e.post('/turns', submission(e, state))]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    const denied = responses.find(r => r.status === 409);
    await refused(denied, 409, 'stale-conversation');
    assert.equal((await e.service.export(e.binding)).turns.length, 1);
    await noExecution(e);
  });

  check('stale generation, conversation, project and cleared input fail without admission', async (_t, e) => {
    const state = await e.service.read(e.binding), input = submission(e, state);
    const before = await e.service.export(e.binding);
    for (const [extra, code] of [
      [{ generation: 'old-generation' }, 'stale-generation'],
      [{ revision: state.revision + 1 }, 'stale-conversation'],
      [{ projectRevision: e.doc.revision + 1 }, 'stale-project'],
    ]) await refused(await e.post('/turns', { ...input, ...extra }), 409, code);
    await unchanged(e, before);
    const cleared = await e.post('/clear', { generation: state.generation, revision: state.revision }).then(r => r.json());
    await refused(await e.post('/turns', input), 409, 'stale-generation');
    assert.equal((await e.service.export(e.binding)).turns.length, 0);
    assert.notEqual(cleared.generation, state.generation);
  });

  check('extra authority, credentials, layout and execution fields are refused by the canonical schema', async (_t, e) => {
    const input = submission(e, await e.service.read(e.binding)), before = await e.service.export(e.binding);
    for (const extra of [
      { owner: e.owner }, { admin: true }, { provider: { apiKey: 'PRIVATE_KEY' } },
      { edits: [] }, { runId: 'PRIVATE_RUN' }, { workerId: 'chosen-worker' },
      { plan: {} }, { coordinates: { x: 0, y: 0 } }, { history: [] },
    ]) await refused(await e.post('/turns', { ...input, ...extra }), 422, 'invalid-document');
    await refused(await e.post('/turns', { ...input, limits: { ...input.limits, maxExchanges: 9 } }), 422, 'invalid-document');
    await refused(await e.post('/turns', { ...input, scope: { ...input.scope, readableSlides: ['PRIVATE_OTHER_SLIDE'] } }), 400, 'invalid-request');
    for (const suffix of ['/turns?owner=PRIVATE_OWNER', '/turns?limit=1&limit=2'])
      await refused(await e.post(suffix, input), 400, 'invalid-request');
    await unchanged(e, before);
    await noExecution(e);
  });

  check('signed-out, cross-owner, administrator, deletion and revoked-session requests cannot submit', async (_t, e) => {
    const input = submission(e, await e.service.read(e.binding)), before = await e.service.export(e.binding);
    await refused(await e.post('/turns', input, { token: null }), 401, 'unauthorized');
    await refused(await e.post('/turns', input, { token: e.otherToken }), 404, 'not-found');
    const created = await e.request('/api/v2/projects', { token: e.otherToken, method: 'POST', body: JSON.stringify({ title: 'Other private project', scenes: seed() }) }).then(r => r.json());
    await promoteToAdmin(e.owner);
    assert.equal((await e.request('/api/auth/me', { token: e.token }).then(r => r.json())).user.role, 'admin');
    await refused(await e.request(`/api/v2/projects/${created.project.id}/conversation/turns`, { token: e.token, method: 'POST', body: JSON.stringify(input) }), 404, 'not-found');
    await unchanged(e, before);
    await e.store.deleteProject(e.binding);
    await refused(await e.post('/turns', input), 404, 'not-found');
    await e.request('/api/auth/logout', { token: e.token, method: 'POST', body: '{}' });
    await refused(await e.post('/turns', input), 401, 'unauthorized');
  });

  test(`${label} submission HTTP: local ownerless submission keeps the accepted project policy`, { timeout: 45000 }, async t => {
    const e = await setup(t, { FORGE_HOSTED: '0' });
    const input = submission(e, await e.service.read(e.binding));
    assert.equal(e.binding.owner, null);
    const response = await e.post('/turns', input);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).turn.state, 'submitted');
    await refused(await e.post('/turns', input, { token: e.token }), 404, 'not-found');
    await noExecution(e);
  });

  check('ownership is rechecked in H after session resolution', async (t, e) => {
    const input = submission(e, await e.service.read(e.binding));
    const base = await isolatedRouter(t, e, async () => ({ submit: async (...args) => {
      await e.store.withRuntimeTransaction(e.binding, tx => tx.query('UPDATE v2_projects SET owner=? WHERE id=?', ['import-other@example.test', e.doc.id]));
      return e.service.submit(...args);
    } }));
    await refused(await fetch(base + '/turns', { method: 'POST', headers: { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), 404, 'not-found');
    assert.equal((await e.service.read({ owner: 'import-other@example.test', id: e.doc.id })).turns.length, 0);
    assert.deepEqual((await e.store.getProject({ owner: 'import-other@example.test', id: e.doc.id })).doc.scenes, e.doc.scenes);
  });

  check('large UTF-8 bodies and Express case/trailing-slash matches use the submission budget only', async (_t, e) => {
    const input = submission(e, await e.service.read(e.binding), { request: '漢'.repeat(8000) });
    assert.ok(Buffer.byteLength(JSON.stringify(input)) > 8192);
    const response = await e.post('/TuRnS/', input, { headers: { 'Content-Type': 'application/json; charset="UTF-8"', 'Content-Encoding': 'identity' } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).turn.request, input.request);
    assert.deepEqual((await e.service.export(e.binding)).turns[0].request, input.request);
  });

  check('exact wire-byte admission counts padding, rejects overflow and keeps lifecycle caps', async (_t, e) => {
    const input = submission(e, await e.service.read(e.binding));
    const body = JSON.stringify(input), exact = body + ' '.repeat(TURN_LIMITS.submissionBytes - Buffer.byteLength(body));
    const headers = { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' };
    const url = e.base + `/api/v2/projects/${e.doc.id}/conversation`;
    const before = await e.service.export(e.binding);
    const over = await rawRequest(url + '/turns', { method: 'POST', body: exact + ' ', headers });
    assert.equal(over.status, 413);
    assert.equal(over.headers['cache-control'], 'private, no-store');
    assert.equal(JSON.parse(over.text).code, 'request-too-large');
    await unchanged(e, before);
    for (const [method, suffix] of [
      ['POST', '/clear'], ['POST', '/cancel'], ['POST', '/decisions'],
      ['POST', '/turns/extra'], ['POST', '/submit'], ['POST', '/unknown'],
      ['PUT', '/turns'], ['GET', '/turns'], ['DELETE', '/turns'],
    ]) {
      const result = await rawRequest(url + suffix, { method, body: JSON.stringify({ request: 'PRIVATE_'.repeat(1400) }), headers });
      assert.equal(result.status, 413, `${method} ${suffix}`);
      assert.equal(result.headers['cache-control'], 'private, no-store');
      assert.equal(result.text.includes('PRIVATE_'), false);
    }
    const accepted = await rawRequest(url + '/turns', { method: 'POST', body: exact, headers });
    assert.equal(accepted.status, 200);
    assert.equal(JSON.parse(accepted.text).turn.state, 'submitted');
    await noExecution(e);
  });

  check('compressed, non-UTF-8, ambiguous media and malformed private bodies are refused without echo', async (_t, e) => {
    const input = submission(e, await e.service.read(e.binding)), before = await e.service.export(e.binding);
    const body = JSON.stringify(input), headers = { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' };
    const url = e.base + `/api/v2/projects/${e.doc.id}/conversation/turns`;
    for (const [content, extra] of [
      [gzipSync(body), { 'Content-Encoding': 'gzip' }],
      [Buffer.from(body, 'utf16le'), { 'Content-Type': 'application/json; charset=utf-16le' }],
      [body, { 'Content-Type': 'application/json; charset=utf-8; charset=utf-16le' }],
      [body, { 'Content-Type': 'application/json; profile=PRIVATE_PROFILE' }],
      [body, { 'Content-Type': 'text/plain' }],
    ]) {
      const result = await rawRequest(url, { method: 'POST', body: content, headers: { ...headers, ...extra } });
      assert.equal(result.status, 415);
      assert.equal(result.headers['cache-control'], 'private, no-store');
      assert.equal(JSON.parse(result.text).code, 'unsupported-media-type');
      assert.equal(result.text.includes('PRIVATE_'), false);
    }
    for (const invalid of ['{"PRIVATE_MALFORMED":', '[]', 'null',
      Buffer.concat([Buffer.from('{"request":"PRIVATE_'), Buffer.from([0xff]), Buffer.from('"}')]),
    ]) {
      const result = await rawRequest(url, { method: 'POST', body: invalid, headers });
      assert.equal(result.status, 400);
      assert.equal(result.headers['cache-control'], 'private, no-store');
      assert.equal(result.text.includes('PRIVATE_'), false);
    }
    const invalidPath = await rawRequest(e.base + '/API/V2/PROJECTS/PRIVATE_%E0%A4%A/CONVERSATION/TURNS', { method: 'POST', body, headers });
    assert.equal(invalidPath.status, 400);
    assert.equal(invalidPath.headers['cache-control'], 'private, no-store');
    assert.equal(invalidPath.text.includes('PRIVATE_'), false);
    await unchanged(e, before);
  });

  check('storage admission is a private conflict and explicit clear permits a new submission', async (_t, e) => {
    let state = await e.service.read(e.binding);
    for (let i = 0; i < TURN_LIMITS.turns; i++) {
      const added = await e.service.submit(e.binding, submission(e, state));
      assert.equal(added.ok, true);
      state = await e.service.cancel(e.binding, { generation: added.generation, revision: added.revision, turnId: added.turn.id });
      assert.equal(state.ok, true);
    }
    const before = await e.service.export(e.binding);
    await refused(await e.post('/turns', submission(e, state)), 409, 'storage-limit');
    await unchanged(e, before);
    const cleared = await e.post('/clear', { generation: state.generation, revision: state.revision }).then(r => r.json());
    assert.equal((await e.post('/turns', submission(e, cleared))).status, 200);
    await noExecution(e);
  });

  check('a lost response reopens the same committed turn without execution', async (t, e) => {
    const input = submission(e, await e.service.read(e.binding));
    let arrived, release;
    const committed = new Promise(resolve => { arrived = resolve; });
    const finish = new Promise(resolve => { release = resolve; });
    t.after(() => release());
    const base = await isolatedRouter(t, e, async () => ({ submit: async (...args) => {
      const result = await e.service.submit(...args); arrived(result); await finish; return result;
    } }));
    const controller = new AbortController();
    const response = fetch(base + '/turns', { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const original = await committed;
    assert.equal(original.ok, true);
    controller.abort(); release();
    await assert.rejects(response, { name: 'AbortError' });
    const replay = await e.post('/turns', input).then(r => r.json());
    assert.equal(replay.turn.id, original.turn.id);
    assert.equal((await e.service.export(e.binding)).turns.length, 1);
    await noExecution(e);
  });

  check('unexpected submission backend errors remain fixed private JSON', async (t, e) => {
    const input = submission(e, await e.service.read(e.binding));
    const base = await isolatedRouter(t, e, async () => ({ submit: async () => { throw new Error('PRIVATE_SQL_KEY'); } }));
    await refused(await fetch(base + '/turns', { method: 'POST', headers: { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), 500, 'request-failed');
    await noExecution(e);
  });

  for (const family of ['openai-compatible', 'anthropic'])
    check(`${family} submission joins trusted preparation, explicit approval and canonical execution`, async (t, e) => {
      let dispatches = 0;
      const remote = await endpoint(t, family, (_req, res) => {
        dispatches++;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(wire(family, [reviewedEdit()])));
      });
      const input = submission(e, await e.service.read(e.binding));
      const added = await e.post('/turns', input).then(r => r.json());
      assert.equal(added.turn.state, 'submitted'); assert.equal(dispatches, 0);
      const work = { generation: added.generation, turnId: added.turn.id, workerId: 'trusted-submission-fixture' };
      const prepared = await createTurnWorker(e.store, remote.provider).work(e.binding, work);
      assert.equal(prepared.turn.state, 'awaiting-decision'); assert.equal(dispatches, 1);
      assert.deepEqual((await e.store.getProject(e.binding)).doc, e.doc);
      const current = await e.service.inspect(e.binding, { generation: added.generation, turnId: added.turn.id });
      const approved = await e.post('/decisions', decision(current, current.turn)).then(r => r.json());
      assert.equal(approved.turn.run.status, 'queued');
      const applied = await createTurnWorker(e.store).work(e.binding, work);
      assert.equal(applied.run.status, 'succeeded'); assert.equal(applied.advances, 1);
      assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, expectedReview(e.doc));
      const replay = await e.post('/turns', input).then(r => r.json());
      assert.equal(replay.turn.run.id, approved.turn.run.id);
      assert.equal(replay.turn.run.status, 'succeeded'); assert.equal(dispatches, 1);
      assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 2);
      const restored = await e.store.restoreRevision({ ...e.binding, baseRevision: 1, targetRevision: 0 });
      assert.deepEqual(restored.doc.scenes, e.doc.scenes);
    });
}
