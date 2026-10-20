import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProviderRunner } from '../packages/agent/provider-run.ts';
import { endpoint, wire } from './v2-provider-fixture.js';
import { seed } from './v2-tool-fixture.js';
import { spec } from './v2-runtime-fixture.js';
const send = (res, body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
for (const family of ['openai-compatible', 'anthropic']) {
  test(`${family}: canonical read result reaches the next real HTTP exchange`, async t => {
    let calls = 0;
    const http = await endpoint(t, family, (_req, res, seen) => {
      if (++calls === 1) return send(res, wire(family, [{ tool: 'get_selected_elements', args: {} }]));
      const messages = seen.body.messages;
      const encoded = JSON.stringify(messages);
      assert.ok(encoded.includes('Measured '));
      assert.ok(!encoded.includes('112233') && !encoded.includes('Unrelated private slide'));
      if (family === 'anthropic') {
        assert.equal(messages[1].role, 'assistant');
        assert.equal(messages[1].content[0].type, 'tool_use');
        assert.equal(messages[2].content[0].tool_use_id, 'call-0');
        send(res, { type: 'message', role: 'assistant', model: 'fixture-resolved-model', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Reviewed safely.' }] });
      } else {
        assert.equal(messages[2].role, 'assistant');
        assert.equal(messages[3].role, 'tool'); assert.equal(messages[3].tool_call_id, 'call-0');
        send(res, { model: 'fixture-resolved-model', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Reviewed safely.' } }] });
      }
    });
    const binding = { id: 'p', owner: 'owner' }, doc = { id: 'p', revision: 0, scenes: seed() };
    const backend = { withRuntimeTransaction: async (bound, job) => {
      assert.deepEqual(bound, binding);
      return job({ doc, now: async () => Date.now(), query: () => { throw new Error('No durable effect'); }, beforeCommit: () => {} });
    } };
    const runner = createProviderRunner(backend, http.provider);
    const output = await runner.converse(binding, { requestId: 'conversation-1', projectRevision: 0,
      scope: spec().scope, reads: [{ tool: 'get_project', args: {} }], request: 'Read the selection, then answer.',
      deadlineAt: Date.now() + 60000, contextChars: 100000, maxOutputTokens: 2048,
      limits: { maxExchanges: 3, maxToolCalls: 8, maxOutputTokensTotal: 6144 } });
    assert.equal(output.ok, true); assert.equal(output.outcome, 'text'); assert.equal(output.summary.text, 'Reviewed safely.');
    assert.equal(output.conversation.exchanges, 2); assert.equal(output.conversation.toolCalls, 1);
    assert.equal(output.conversation.reservedOutputTokens, 4096);
    assert.equal(output.conversation.reportedOutputTokens, null);
    assert.ok(!JSON.stringify(output.conversation).includes('Measured'));
    assert.equal((await runner.enqueue(output)).code, 'invalid-proposal');
  });
}

import { providerProfile, prepareExchange } from '../packages/agent/provider.ts';
import { createDocument } from '../packages/tools/executor.ts';
import { createToolSession } from '../packages/tools/session.ts';
import { composeInstructions } from '../packages/agent/context.ts';
import { caps } from './v2-provider-fixture.js';
function rig(handler = async () => ({ ok: true, providerId: 'provider', family: 'openai-compatible', model: 'resolved', outcome: 'text', text: 'Answer.', calls: [], usage: null }), transaction) {
  const binding = { id: 'p', owner: 'owner' }, doc = { id: 'p', revision: 0, scenes: seed() }, seen = [];
  let transactions = 0;
  const profile = providerProfile({ id: 'provider', family: 'openai-compatible', model: 'configured', capabilities: caps() });
  const provider = { profile, exchange: async (context, options) => { seen.push({ context, options }); return handler(context, options, seen.length); } };
  const backend = { withRuntimeTransaction: async (bound, job) => {
    transactions++; assert.deepEqual(bound, { id: 'p', owner: 'owner' });
    const tx = { doc, now: async () => Date.now(), query: () => { throw new Error('No durable query'); }, beforeCommit: () => {} };
    return transaction ? transaction(tx, job) : job(tx);
  } };
  return { binding, doc, seen, provider, runner: createProviderRunner(backend, provider), counts: () => ({ calls: seen.length, transactions }),
    input: { requestId: 'loop-1', projectRevision: 0, scope: spec().scope, reads: [{ tool: 'get_project', args: {} }], request: 'Review selected content.',
      deadlineAt: Date.now() + 60000, contextChars: 100000, maxOutputTokens: 2048, limits: { maxExchanges: 4, maxToolCalls: 16, maxOutputTokensTotal: 8192 } } };
}
for (const [name, mutate] of [
  ['zero exchange allowance', r => { r.limits.maxExchanges = 0; }],
  ['excessive exchange allowance', r => { r.limits.maxExchanges = 9; }],
  ['invalid tool allowance', r => { r.limits.maxToolCalls = 33; }],
  ['fractional output allowance', r => { r.limits.maxOutputTokensTotal = 1.5; }],
  ['unknown authority metadata', r => { r.limits.owner = 'admin'; }],
  ['untrusted message history', r => { r.history = []; }],
  ['layout inside a read', r => { r.reads[0].args.x = 7; }],
]) test(`conversation rejects ${name} before storage or HTTP`, async () => {
  const env = rig(); mutate(env.input);
  assert.equal((await env.runner.converse(env.binding, env.input)).code, 'invalid-request');
  assert.deepEqual(env.counts(), { calls: 0, transactions: 0 });
});
test('conversation refuses nested live accessors without invoking them', async () => {
  const env = rig(); let executed = false;
  Object.defineProperty(env.input.limits, 'maxExchanges', { enumerable: true, get() { executed = true; return 3; } });
  assert.equal((await env.runner.converse(env.binding, env.input)).code, 'invalid-request'); assert.equal(executed, false);
});
test('deadline returns while initial storage is pending and late storage cannot issue HTTP', async () => {
  let release, entered, finished;
  const gate = new Promise(r => { release = r; }), arrived = new Promise(r => { entered = r; }), done = new Promise(r => { finished = r; });
  const env = rig(undefined, async (tx, job) => { entered(); await gate; try { return await job(tx); } finally { finished(); } });
  env.input.deadlineAt = Date.now() + 250;
  const pending = env.runner.converse(env.binding, env.input); await arrived;
  const result = await pending; assert.equal(result.code, 'deadline'); assert.equal(result.conversation.exchanges, 0);
  release(); await done; await new Promise(setImmediate); assert.equal(env.seen.length, 0);
});
test('the single 120s timer starts before the first storage await', async t => {
  let watchdog;
  const real = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => {
    if (ms === 120000 && !watchdog) watchdog = fn;
    return real(fn, ms, ...args);
  });
  let release; const gate = new Promise(r => { release = r; });
  const env = rig(undefined, async (tx, job) => { assert.equal(typeof watchdog, 'function'); await gate; return job(tx); });
  env.input.deadlineAt = Date.now() + 300000;
  const pending = env.runner.converse(env.binding, env.input);
  watchdog(); const result = await pending; assert.equal(result.code, 'timeout'); release();
  await new Promise(setImmediate); assert.equal(env.seen.length, 0);
});
test('failed provider usage remains unknown and returned trace cannot change after late completion', async () => {
  let release, reached; const gate = new Promise(r => { release = r; }), arrived = new Promise(r => { reached = r; });
  const env = rig(async () => { reached(); return gate; });
  const controller = new AbortController(), pending = env.runner.converse(env.binding, env.input, { signal: controller.signal });
  await arrived; controller.abort(); const result = await pending;
  assert.equal(result.code, 'cancelled'); assert.equal(result.conversation.reportedOutputTokens, null);
  const before = JSON.stringify(result); release({ ok: false, code: 'unauthorized', message: 'secret' });
  await new Promise(setImmediate); assert.equal(JSON.stringify(result), before); assert.ok(!before.includes('secret'));
});
test('binding, nested scope and limits are copied before the first asynchronous boundary', async () => {
  const env = rig(async () => {
    env.binding.owner = 'foreign'; env.input.scope.readableSlides.push('s2'); env.input.limits.maxExchanges = 8;
    return { ok: true, providerId: 'provider', family: 'openai-compatible', model: 'resolved', outcome: 'text', text: 'Answer.', calls: [], usage: null };
  });
  assert.equal((await env.runner.converse(env.binding, env.input)).outcome, 'text');
  assert.ok(!JSON.stringify(env.seen[0].context).includes('Unrelated private slide'));
});
for (const family of ['openai-compatible', 'anthropic']) test(`${family}: history validates semantic results and actual wire budget`, async () => {
  const profile = providerProfile({ id: 'provider', family, model: 'configured', capabilities: caps() });
  const document = await createDocument(seed());
  const session = createToolSession({ document, projectId: 'p', ownerId: 'owner', actorId: 'owner', agentId: 'agent', ...spec().scope });
  const context = await composeInstructions({ session, request: 'Read selection.', reads: [{ tool: 'get_project', args: {} }] });
  assert.equal(context.ok, true);
  const request = { tool: 'get_selected_elements', args: {} }, result = await session.execute(request);
  const exchange = { ok: true, providerId: 'provider', family, model: 'resolved', outcome: 'tool-calls', text: '', calls: [{ id: 'call-1', request }], usage: null };
  const history = [{ exchange, results: [result] }];
  const first = prepareExchange(profile, context), next = prepareExchange(profile, context, { history });
  assert.ok(next.wire); const chars = JSON.stringify(first.wire).length;
  assert.equal(prepareExchange(profile, context, { history, contextChars: chars }).code, 'context-too-large');
  assert.equal(prepareExchange(profile, context, { history: [{ exchange, results: [] }] }).code, 'invalid-request');
  const bad = structuredClone(history); bad[0].results[0].data.elements[0].element.x = 9;
  assert.equal(prepareExchange(profile, context, { history: bad }).code, 'invalid-request');
  const changed = structuredClone(history); changed[0].results[0].changed = true;
  assert.equal(prepareExchange(profile, context, { history: changed }).code, 'invalid-request');
  const stale = structuredClone(history); stale[0].results[0].revision = 1;
  assert.equal(prepareExchange(profile, context, { history: stale }).code, 'invalid-request');
});


test('conversation scope and initial reads keep the accepted canonical contract', async () => {
  const { readFile } = await import('node:fs/promises');
  const schema = async name => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
  const base = await schema('../packages/agent/provider-run-request.schema.json');
  const conversation = await schema('../packages/agent/conversation-request.schema.json');
  for (const [key, value] of Object.entries(base.properties)) assert.deepEqual(conversation.properties[key], value, key);
  assert.deepEqual(conversation.required.filter(k => k !== 'limits'), base.required);
});
