import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { wakeScenario, until } from './v2-host-wake-fixture.js';
import { lookup, targetRequest, targetConfiguration, targetCli } from './v2-target-wake-fixture.js';
import { decision } from './v2-turns-contract.js';
import { expectedReview } from './v2-provider-contract.js';
import { openAutoTargetWork } from '../src/agent/target-work.js';
import { createAutoHostPolicy } from '../src/agent/auto-host-policy.js';
import { createTurnDiscovery } from '../packages/agent/turn-discovery.ts';
import { wire } from './v2-provider-fixture.js';
const check = (name, body) => test('SQLite target: ' + name, { timeout: 25000 }, body);
check('exact work skips owner discovery, waits for approval and commits once without provider lookup', async t => {
  const e = await wakeScenario(t), input = lookup(await e.submit()); let scans = 0;
  const backend = { ...e.store, readTurnMetadataPage: () => { scans++; throw new Error('Owner scan forbidden'); } };
  const api = e.host({ backend: async () => backend });
  assert.equal((await api.wake(targetRequest(e, input))).status, 'accepted');
  await until(e.turn, v => v.state === 'awaiting-decision'); await api.close();
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
  const state = await e.service.read(e.binding); assert.equal((await e.service.decide(e.binding, decision(state, state.turns[0]))).ok, true);
  const noProvider = e.host({ backend: async () => backend, policy: createAutoHostPolicy({ ...e.policyOptions, readConfiguration: () => { throw new Error('PRIVATE'); }, readSecret: () => { throw new Error('PRIVATE'); } }) });
  assert.equal((await noProvider.wake(targetRequest(e, input))).ok, true);
  await until(e.turn, v => v.run?.status === 'succeeded'); await noProvider.close();
  // Discovery hints are deliberately seeded metadata, not new canonical runs.
  // Exact work must not consume even a prefix that exhausts both owner cycles.
  const history = await e.store.createProject({ owner: e.owner, title: 'Historical index', scenes: e.doc.scenes });
  await e.service.read({ owner: e.owner, id: history.doc.id });
  const template = e.db.prepare('SELECT payload,private_payload FROM v2_agent_turns WHERE id=?').get(input.turnId);
  const head = JSON.parse(e.db.prepare('SELECT payload FROM v2_agent_conversations WHERE project_id=?').get(history.doc.id).payload);
  const insert = e.db.prepare('INSERT INTO v2_agent_turns (id,project_id,generation,request_key,payload,private_payload) VALUES(?,?,?,?,?,?)');
  for (let i = 0; i < 101; i++) {
    const meta = { ...JSON.parse(template.payload), id: 'history-' + String(i).padStart(3, '0'), generation: head.generation, requestKey: crypto.randomUUID() };
    insert.run(meta.id, history.doc.id, head.generation, meta.requestKey, JSON.stringify(meta), template.private_payload);
  }
  const page = await createTurnDiscovery(e.store).discover({ owner: e.owner }, { limit: 50, cursor: null });
  assert.equal(page.scannedRows, 50); assert.equal(page.hasMore, true);
  assert.equal(page.items.filter(v => v.state === 'approved').length, 50);
  const replay = e.host({ backend: async () => backend }); await replay.wake(targetRequest(e, input)); await replay.close();
  await e.store.closeProjectStore(); const final = (await e.store.getProject(e.binding)).doc;
  assert.equal(final.revision, 1); assert.deepEqual(final.scenes, expectedReview(e.doc));
  assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 2);
  assert.equal(scans, 0); assert.equal(e.seen.length, 1); assert.equal(e.events().length, 1); assert.equal(e.lifetime(), 62);
});
check('missing foreign stale and deleted targets refuse before any configuration or dispatch', async t => {
  const e = await wakeScenario(t), input = lookup(await e.submit()); let configs = 0;
  const api = e.host({ policy: createAutoHostPolicy({ ...e.policyOptions, readConfiguration: () => { configs++; throw new Error(); } }) });
  for (const [target, code] of [[{ ...input, turnId: 'missing' }, 'not-found'], [{ ...input, generation: 'stale' }, 'stale-generation'],
    [{ ...input, projectId: 'missing' }, 'not-found']]) {
    e.advance(); assert.equal((await api.wake({ ...e.identity, target: { projectId: e.doc.id, ...target } })).code, code);
  }
  const foreign = await e.store.createProject({ owner: 'other@forge.invalid', title: 'Private', scenes: e.doc.scenes });
  e.advance(); assert.equal((await api.wake({ ...e.identity, target: { projectId: foreign.doc.id, ...input } })).code, 'not-found');
  await e.store.deleteProject(e.binding); e.advance(); assert.equal((await api.wake(targetRequest(e, input))).code, 'not-found');
  assert.equal(configs, 0); assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0);
});
check('account recreation during opening cannot remap the targeted account', async t => {
  const e = await wakeScenario(t), input = lookup(await e.submit()), policy = createAutoHostPolicy(e.policyOptions);
  const api = e.host({ policy: { open: async binding => {
    const session = await policy.open(binding); e.db.prepare('DELETE FROM users WHERE id=?').run(e.userId);
    e.db.prepare('INSERT INTO users(email,name,created_at,verified_at) VALUES(?,?,?,?)').run(e.owner, 'Recreated', new Date().toISOString(), new Date().toISOString()); return session;
  } } });
  assert.equal((await api.wake(targetRequest(e, input))).code, 'owner-ineligible'); assert.equal(e.seen.length, 0);
});
check('clear after admission preflight prevents provider resolution on actual work', async t => {
  const e = await wakeScenario(t), input = lookup(await e.submit()); let configs = 0;
  const session = await openAutoTargetWork(e.identity, { projectId: e.doc.id, ...input }, { enabled: () => true,
    policy: createAutoHostPolicy({ ...e.policyOptions, readConfiguration: () => { configs++; throw new Error(); } }), backend: async () => e.store });
  const state = await e.service.read(e.binding); await e.service.clear(e.binding, { generation: state.generation, revision: state.revision });
  assert.equal((await session.work()).code, 'stale-generation'); assert.equal(configs, 0); assert.equal(e.seen.length, 0);
});
check('human save after approval survives target execution as a stale run refusal', async t => {
  const e = await wakeScenario(t), input = lookup(await e.submit()); const receipt = await e.api.wake(targetRequest(e, input));
  assert.equal(receipt.status, 'accepted', JSON.stringify(receipt));
  await until(e.turn, v => v.state === 'awaiting-decision'); await e.api.close();
  const state = await e.service.read(e.binding); await e.service.decide(e.binding, decision(state, state.turns[0]));
  const scenes = structuredClone(e.doc.scenes); scenes[0].elements[0].paragraphs[0].runs[0].text = 'Human preserved';
  await e.store.saveProject({ ...e.binding, baseRevision: 0, scenes });
  const api = e.host(); await api.wake(targetRequest(e, input)); await until(e.turn, v => v.run?.status === 'failed'); await api.close();
  assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, scenes); assert.equal(e.seen.length, 1);
});
check('cancel during targeted preparation prevents a late proposal or retry', async t => {
  let release; const pending = new Promise(r => { release = r; }); t.after(() => release());
  const e = await wakeScenario(t, { handler: async (_req, res) => { await pending; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(wire('openai-compatible'))); } });
  const input = lookup(await e.submit()); await e.api.wake(targetRequest(e, input)); await e.arrived;
  const state = await e.service.read(e.binding); await e.service.cancel(e.binding, { generation: state.generation, revision: state.revision, turnId: input.turnId });
  release(); await e.api.close(); assert.equal((await e.turn()).state, 'cancelled');
  const replay = e.host(); await replay.wake(targetRequest(e, input)); await replay.close();
  assert.equal(e.seen.length, 1); assert.equal((await e.turn()).proposal, null); assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
});
check('work-auto CLI prepares and executes through pinned Auto with truthful metadata and no replay', async t => {
  const e = await wakeScenario(t), input = lookup(await e.submit()); await targetConfiguration(e);
  const prepared = await targetCli(t, e, input); assert.equal(prepared.code, 0, prepared.stderr); assert.equal(prepared.value.turn.state, 'awaiting-decision');
  const state = await e.service.read(e.binding); await e.service.decide(e.binding, decision(state, state.turns[0]));
  await rm(path.join(e.dir, 'agent-host.json'));
  const executed = await targetCli(t, e, input); assert.equal(executed.code, 0, executed.stderr); assert.equal(executed.value.run.status, 'succeeded');
  const replay = await targetCli(t, e, input); assert.equal(replay.code, 0); assert.equal(e.seen.length, 1); assert.equal(e.lifetime(), 62);
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 1); assert.equal(executed.stdout.includes('fixture-private-key'), false);
});
check('work-auto CLI defaults off and rejects invalid authority or raw UTF-8 privately', async t => {
  const e = await wakeScenario(t), input = lookup(await e.submit());
  for (const options of [{ enabled: false }, { owner: null }, { extra: ['--provider', '/PRIVATE'] },
    { raw: JSON.stringify({ ...input, workerId: 'PRIVATE' }) }, { raw: Buffer.from([0xff, 0xfe]) }, { raw: ' '.repeat(2049) + '{}' }]) {
    const r = await targetCli(t, e, input, options); assert.equal(r.code, 1); assert.equal(r.stdout, ''); assert.equal(JSON.parse(r.stderr).ok, false); assert.equal(r.stderr.includes('PRIVATE'), false);
  }
  assert.equal(e.seen.length, 0); assert.equal(e.events().length, 0);
});
