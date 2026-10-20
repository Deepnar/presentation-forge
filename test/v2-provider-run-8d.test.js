import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProviderRunner } from '../packages/agent/provider-run.ts';
import { providerProfile } from '../packages/agent/provider.ts';
import { caps } from './v2-provider-fixture.js';
import { seed, edit } from './v2-tool-fixture.js';
import { spec } from './v2-runtime-fixture.js';
const profile = () => providerProfile({ id: 'provider', family: 'openai-compatible', model: 'configured', capabilities: caps() });
const exchange = () => ({ ok: true, providerId: 'provider', family: 'openai-compatible', model: 'resolved',
  text: '', outcome: 'tool-calls', calls: [{ id: 'a', request: edit() }], usage: { inputTokens: 10, outputTokens: 2 } });
function rig(result = exchange(), scenes = seed()) {
  let transactions = 0, calls = 0;
  const binding = { id: 'p', owner: 'owner' }, plan = spec();
  const input = { requestId: 'turn-1', projectRevision: 0, scope: plan.scope, request: 'Review selection',
    reads: [{ tool: 'get_selected_elements', args: {} }], deadlineAt: Date.now() + 60000,
    contextChars: 100000, maxOutputTokens: 2048 };
  const provider = { profile: profile(), exchange: async () => { calls++; return result; } };
  const backend = { withRuntimeTransaction: async (b, job) => {
    transactions++; assert.deepEqual(b, binding);
    return job({ doc: { id: 'p', revision: 0, scenes }, now: async () => Date.now(),
      query: async () => { throw new Error('No durable query expected in preparation'); },
      beforeCommit: () => {}, saveScenes: async () => { throw new Error('No durable save expected'); } });
  } };
  return { runner: createProviderRunner(backend, provider), binding, input, provider,
    counts: () => ({ calls, transactions }) };
}
test('provider-run scope and read schemas remain canonical', async () => {
  const json = async name => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
  const request = await json('../packages/agent/provider-run-request.schema.json');
  const plan = await json('../packages/agent/run-plan.schema.json');
  const tool = await json('../packages/tools/request.schema.json');
  assert.deepEqual(request.properties.scope, plan.properties.scope);
  assert.deepEqual(request.properties.reads.items.oneOf, tool.oneOf.filter(b => b.properties.tool.const !== 'edit_content'));
});
for (const [name, change] of [
  ['unrecognized authority fields', r => { r.admin = true; }],
  ['invalid context reads', r => { r.reads = [edit()]; }],
  ['invalid trusted scope', r => { r.scope.admin = true; }],
  ['empty request text', r => { r.request = ' '; }],
  ['context bounds', r => { r.contextChars = 100001; }],
  ['configured output allowance', r => { r.maxOutputTokens = 2049; }],
  ['nested geometry', r => { r.reads[0].args.x = 4; }],
  ['duplicate selection', r => { r.scope.selection.push(structuredClone(r.scope.selection[0])); }],
]) {
  test(`preparation rejects ${name} before storage or provider I/O`, async () => {
    const env = rig(); change(env.input);
    assert.equal((await env.runner.prepare(env.binding, env.input)).code, 'invalid-request');
    assert.deepEqual(env.counts(), { calls: 0, transactions: 0 });
  });
}
test('live accessors, cycles and option accessors are refused without execution', async () => {
  const env = rig(); let read = false;
  const input = { ...env.input, get request() { read = true; throw new Error('secret'); } };
  assert.equal((await env.runner.prepare(env.binding, input)).code, 'invalid-request');
  const cycle = { ...env.input }; cycle.request = cycle;
  assert.equal((await env.runner.prepare(env.binding, cycle)).code, 'invalid-request');
  const options = { get signal() { read = true; throw new Error('secret'); } };
  assert.equal((await env.runner.prepare(env.binding, env.input, options)).code, 'invalid-request');
  assert.equal(read, false); assert.equal(env.counts().calls, 0);
});
for (const [name, change] of [
  ['foreign provider identity', r => { r.providerId = 'foreign'; }],
  ['wrong family', r => { r.family = 'anthropic'; }],
  ['unsupported outcome', r => { r.outcome = 'stream'; }],
  ['extra authority metadata', r => { r.owner = 'owner'; }],
  ['duplicate tool IDs', r => { r.calls.push(structuredClone(r.calls[0])); }],
  ['noncanonical arguments', r => { r.calls[0].request.args.ops = []; }],
  ['stale engine revision', r => { r.calls[0].request.args.baseRevision = 1; }],
  ['inconsistent terminal outcome', r => { r.outcome = 'text'; r.text = 'Done'; }],
  ['invalid usage counters', r => { r.usage.inputTokens = -1; }],
  ['output over allowance', r => { r.usage.outputTokens = 2049; }],
  ['missing usage field', r => { delete r.usage; }],
  ['oversized summary', r => { r.text = 'x'.repeat(32001); }],
]) {
  test(`injected provider cannot bypass ${name} validation`, async () => {
    const result = exchange(); change(result); const env = rig(result);
    const output = await env.runner.prepare(env.binding, env.input);
    assert.equal(output.code, 'invalid-response'); assert.equal(env.counts().calls, 1);
    assert.equal((await env.runner.enqueue(output)).code, 'invalid-proposal');
  });
}
test('provider failures and thrown exceptions never expose raw diagnostics', async () => {
  for (const code of ['unauthorized', 'provider-unavailable', 'truncated', 'made-up']) {
    const env = rig({ ok: false, code, message: 'fixture-private-key raw response' });
    const result = await env.runner.prepare(env.binding, env.input);
    assert.equal(result.code, code === 'made-up' ? 'invalid-response' : 'provider-error');
    assert.ok(!JSON.stringify(result).includes('fixture-private-key'));
  }
  const env = rig(); env.provider.exchange = async () => { throw new Error('fixture-private-key'); };
  const result = await env.runner.prepare(env.binding, env.input);
  assert.equal(result.code, 'provider-error'); assert.ok(!JSON.stringify(result).includes('fixture-private-key'));
});
test('context and aggregate read-result budgets refuse explicitly', async () => {
  const tiny = rig(); tiny.input.contextChars = 2048;
  assert.equal((await tiny.runner.prepare(tiny.binding, tiny.input)).code, 'result-too-large');
  assert.equal(tiny.counts().calls, 0);
  const scenes = seed(); scenes[0].elements[0].paragraphs[0].runs[0].text = 'x'.repeat(8500);
  const result = exchange(); result.calls = Array.from({ length: 8 }, (_, i) => ({ id: String(i), request: { tool: 'get_selected_elements', args: {} } }));
  const env = rig(result, scenes);
  env.input.reads = [{ tool: 'get_project', args: {} }];
  assert.equal((await env.runner.prepare(env.binding, env.input)).code, 'result-too-large');
});
test('binding and deadline errors refuse before any provider call', async () => {
  const env = rig();
  assert.equal((await env.runner.prepare({ ...env.binding, admin: true }, env.input)).code, 'invalid-request');
  assert.equal((await env.runner.prepare(env.binding, { ...env.input, deadlineAt: Date.now() + 86410000 })).code, 'invalid-request');
  assert.equal(env.counts().calls, 0);
});
