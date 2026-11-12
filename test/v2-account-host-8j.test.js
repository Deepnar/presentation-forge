// F2: the Assistant runs for every account on the provider that account has
// — a key it brought, a local Ollama, or the Auto gateway — through the same
// turn pickup the Auto host uses, with only gateway calls metered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostScenario, pickupInput } from './v2-host-pickup-fixture.js';
import { decision } from './v2-turns-contract.js';
import { expectedReview } from './v2-provider-contract.js';
import { createAccountHostPolicy, transportFor } from '../src/agent/account-host-policy.js';
import { createAutoHostPickup } from '../src/agent/host-pickup.js';
import { currentAccount } from '../src/account.js';

const check = (name, body) => test('Account host: ' + name, { timeout: 20000 }, body);
const byok = (e) => async () => ({ backend: { type: 'openai-compatible', baseURL: e.baseURL, apiKey: 'byok-private-key', providerId: 'openai', billingOwner: 'user' }, model: 'byok-model' });

check('a BYOK account gets a reviewed proposal, applies it after approval, and spends no Auto allowance', async t => {
  const e = await hostScenario(t); await e.submit();
  const seenAccount = [];
  const resolve = async (owner) => { seenAccount.push(owner.email); return byok(e)(); };
  const pickup = () => createAutoHostPickup(e.store, createAccountHostPolicy({ resolve: async (owner) => { const r = await resolve(owner); return r; } }));
  const prepared = await pickup().pickup({ owner: e.owner }, pickupInput());
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(prepared.results[0].turnState, 'awaiting-decision');
  assert.equal(e.seen.length, 1, 'one call to the account\'s provider');
  assert.equal(e.seen[0].headers.authorization, 'Bearer byok-private-key');
  assert.equal(e.seen[0].body.model, 'byok-model');
  assert.deepEqual(seenAccount, [e.owner], 'resolved for this account');
  assert.deepEqual(e.events(), [], 'BYOK is not metered against the Auto allowance');
  assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, e.doc.scenes, 'nothing changes before approval');
  const state = await e.service.read(e.binding);
  assert.equal((await e.service.decide(e.binding, decision(state, state.turns[0]))).ok, true);
  const executed = await pickup().pickup({ owner: e.owner }, pickupInput());
  assert.equal(executed.results[0].runStatus, 'succeeded');
  assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, expectedReview(e.doc));
  assert.equal(JSON.stringify(executed).includes('byok-private-key'), false, 'the key never reaches a result');
});

check('a local Ollama account reaches Ollama on its OpenAI-compatible endpoint', async t => {
  const e = await hostScenario(t); await e.submit();
  const host = e.baseURL.replace(/\/v1$/, '');
  const policy = createAccountHostPolicy({ resolve: async () => ({ backend: { type: 'ollama', host }, model: 'qwen3.6:35b-a3b' }) });
  const prepared = await createAutoHostPickup(e.store, policy).pickup({ owner: e.owner }, pickupInput());
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(e.seen[0].url, '/v1/chat/completions');
  assert.equal(e.seen[0].body.model, 'qwen3.6:35b-a3b');
  assert.deepEqual(e.events(), []);
});

check('the Auto gateway, reached through the account, is metered against that account', async t => {
  const e = await hostScenario(t); await e.submit();
  const policy = createAccountHostPolicy({ resolve: async () => ({ backend: { type: 'openai-compatible', baseURL: e.baseURL, apiKey: 'operator-key', providerId: 'auto', billingOwner: 'operator' }, model: 'operator-model' }) });
  const prepared = await createAutoHostPickup(e.store, policy).pickup({ owner: e.owner }, pickupInput());
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(e.events().length, 1);
  assert.equal(e.events()[0].user_id, e.userId);
});

check('no usable provider stops the turn plainly, and a missing account never resolves one', async t => {
  const e = await hostScenario(t); await e.submit();
  const failing = createAccountHostPolicy({ resolve: async () => { throw new Error('PRIVATE: nothing installed'); } });
  const result = await createAutoHostPickup(e.store, failing).pickup({ owner: e.owner }, pickupInput());
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(e.seen.length, 0);
  let resolved = 0;
  const counting = createAccountHostPolicy({ resolve: async () => { resolved++; return byok(e)(); } });
  const missing = await createAutoHostPickup(e.store, counting).pickup({ owner: 'missing@forge.invalid' }, pickupInput());
  assert.equal(missing.stopReason, 'owner-ineligible');
  assert.equal(resolved, 0);
});

check('resolution runs inside the account, so per-account keys apply', async t => {
  const e = await hostScenario(t); await e.submit();
  let inside = null;
  const policy = createAccountHostPolicy({ resolve: async (owner) => {
    const { runAsAccount } = await import('../src/account.js');
    return runAsAccount({ userId: owner.id, email: owner.email }, async () => { inside = currentAccount(); return byok(e)(); });
  } });
  await createAutoHostPickup(e.store, policy).pickup({ owner: e.owner }, pickupInput());
  assert.equal(inside?.email, e.owner);
});

test('transportFor maps resolved roles to OpenAI-compatible transports and refuses the rest', () => {
  assert.deepEqual(transportFor({ backend: { type: 'ollama', host: 'http://localhost:11434/' }, model: 'm' }),
    { id: 'local-ollama', family: 'openai-compatible', model: 'm', baseURL: 'http://localhost:11434/v1', apiKey: 'ollama', billedToOperator: false, local: true });
  assert.equal(transportFor({ backend: { type: 'openai-compatible', baseURL: 'https://x', apiKey: 'k', providerId: 'auto', billingOwner: 'operator' }, model: 'm' }).billedToOperator, true);
  assert.equal(transportFor({ backend: { type: 'openai-compatible', baseURL: 'https://x' }, model: 'm' }), null, 'no key, no transport');
  assert.equal(transportFor(null), null);
});
