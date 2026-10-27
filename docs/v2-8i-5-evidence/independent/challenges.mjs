import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostScenario, pickupInput } from '../../../test/v2-host-pickup-fixture.js';
import { context, wire } from '../../../test/v2-provider-fixture.js';
import { createAutoHostPolicy } from '../../../src/agent/auto-host-policy.js';
import { prepareExchange } from '../../../packages/agent/provider.ts';
import { limitConfig } from '../../../src/limits.js';

test('concurrent host sessions cannot admit two exchanges against one remaining reservation', { timeout: 10000 }, async t => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  const e = await hostScenario(t, { handler: async (_req, res) => {
    await held;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(wire('openai-compatible')));
  } });
  const policy = createAutoHostPolicy(e.policyOptions);
  const first = await (await policy.open({ owner: e.owner })).provider();
  const second = await (await policy.open({ owner: e.owner })).provider();
  const { context: ctx } = await context();
  const prepared = prepareExchange(first.profile, ctx);
  assert.equal(prepared.ok, undefined);
  const estimate = Buffer.byteLength(JSON.stringify(prepared.wire)) + prepared.outputTokens;
  const cap = limitConfig('free').lifetimeTokens;
  assert.ok(Number.isSafeInteger(cap) && cap > estimate);
  e.db.prepare('UPDATE users SET lifetime_tokens=? WHERE id=?').run(cap - estimate, e.userId);
  const inFlight = first.exchange(ctx);
  await e.arrived;
  const denied = await second.exchange(ctx);
  assert.equal(denied.code, 'rate-limited');
  assert.equal(e.events().length, 1);
  assert.equal(e.events()[0].tokens, estimate);
  assert.equal(e.lifetime(), cap);
  assert.equal(e.seen.length, 1);
  release();
  assert.equal((await inFlight).ok, true);
  assert.equal(e.events()[0].tokens, 62);
  assert.equal(e.lifetime(), cap - estimate + 62);
});

test('in-flight preparation cancellation retains account estimate and persists canonical cancellation', { timeout: 10000 }, async t => {
  const controller = new AbortController();
  const e = await hostScenario(t, { handler: (_req, res) => {
    controller.abort();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(wire('openai-compatible')));
  } });
  assert.equal((await e.submit()).ok, true);
  await e.pickup().pickup({ owner: e.owner }, pickupInput(), { signal: controller.signal });
  const state = await e.service.read(e.binding);
  assert.equal(state.turns[0].state, 'cancelled');
  assert.equal(e.seen.length, 1);
  assert.equal(e.events().length, 1);
  assert.ok(e.events()[0].tokens > 2048);
  assert.equal(e.lifetime(), e.events()[0].tokens);
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 0);
  await e.pickup().pickup({ owner: e.owner }, pickupInput());
  assert.equal(e.events().length, 1);
  assert.equal(e.seen.length, 1);
});
