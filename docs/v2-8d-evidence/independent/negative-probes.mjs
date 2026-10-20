import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenario } from '../../../test/v2-runtime-fixture.js';
import { endpoint, wire, caps } from '../../../test/v2-provider-fixture.js';
import { reviewedEdit, expectedReview } from '../../../test/v2-provider-contract.js';
import { turnInput } from '../../../test/v2-provider-run-contract.js';
import { providerProfile } from '../../../packages/agent/provider.ts';
import { createProviderRunner } from '../../../packages/agent/provider-run.ts';

async function execute(env, runner, proposal, binding) {
  const queued = await runner.enqueue(proposal);
  assert.equal(queued.outcome, 'queued');
  assert.equal(queued.run.projectId, binding.id);
  const claim = await env.runtime.claim(binding, queued.run.id, 'negative-probe');
  assert.equal(claim.ok, true);
  const applied = await env.runtime.advance(binding, queued.run.id, claim.lease);
  assert.equal(applied.run.status, 'succeeded');
  assert.deepEqual((await env.store.getProject(binding)).doc.scenes, expectedReview(env.doc));
}

test('mutating caller binding and nested request during HTTP cannot rebind the private proposal', async t => {
  const env = await scenario(t), binding = { ...env.binding }, trusted = { ...binding };
  let reply;
  const http = await endpoint(t, 'openai-compatible', (_req, res) => { reply = res; });
  const runner = createProviderRunner(env.store, http.provider), input = turnInput(env);
  const preparing = runner.prepare(binding, input);
  await http.arrived;
  binding.id = 'foreign'; binding.owner = 'foreign';
  input.scope.readableSlides.length = 0;
  input.scope.editableTargets[0].elementId = 'foreign';
  input.requestId = 'foreign'; input.projectRevision = 999; input.deadlineAt = 0;
  reply.writeHead(200, { 'content-type': 'application/json' });
  reply.end(JSON.stringify(wire('openai-compatible', [reviewedEdit()])));
  const proposal = await preparing;
  assert.equal(proposal.outcome, 'edit-proposal');
  await execute(env, runner, proposal, trusted);
});

test('mutating a retained normalized response after preparation cannot alter queued content', async t => {
  const env = await scenario(t);
  const response = { ok: true, providerId: 'probe', family: 'openai-compatible', model: 'resolved', text: '', outcome: 'tool-calls', calls: [{ id: 'call', request: reviewedEdit() }], usage: { inputTokens: 10, outputTokens: 2 } };
  const profile = providerProfile({ id: 'probe', family: 'openai-compatible', model: 'configured', capabilities: caps() });
  const runner = createProviderRunner(env.store, { profile, exchange: async () => response });
  const proposal = await runner.prepare(env.binding, turnInput(env));
  assert.equal(proposal.outcome, 'edit-proposal');
  response.calls[0].request.args.edits[0].text = 'Injected';
  response.calls.length = 0; response.usage.outputTokens = 999999; response.text = 'Injected';
  assert.equal(proposal.summary.text, '');
  await execute(env, runner, proposal, env.binding);
});
