import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endpoint, context, wire } from '../../../test/v2-provider-fixture.js';
import { edit } from '../../../test/v2-tool-fixture.js';
import { prepareExchange, parseProviderExchange } from '../../../packages/agent/provider.ts';

for (const family of ['openai-compatible', 'anthropic']) {
  test(`${family}: reported output above the requested allowance refuses`, async t => {
    const { provider } = await endpoint(t, family), { context: ctx, document } = await context();
    const prep = prepareExchange(provider.profile, ctx), raw = wire(family);
    if (family === 'anthropic') raw.usage.output_tokens = 2049;
    else { raw.usage.completion_tokens = 2049; raw.usage.total_tokens = 2091; }
    assert.equal(parseProviderExchange(provider.profile, prep, raw).code, 'invalid-response');
    assert.equal(document.status().revision, 0);
  });
  test(`${family}: unsupported terminal reason cannot produce a proposal`, async t => {
    const { provider } = await endpoint(t, family), { context: ctx } = await context();
    const prep = prepareExchange(provider.profile, ctx), raw = wire(family);
    if (family === 'anthropic') raw.stop_reason = 'pause_turn';
    else raw.choices[0].finish_reason = 'unexpected';
    assert.equal(parseProviderExchange(provider.profile, prep, raw).code, 'invalid-response');
  });
  test(`${family}: a valid call cannot survive beside a noncanonical call`, async t => {
    const { provider } = await endpoint(t, family), { context: ctx, document } = await context();
    const prep = prepareExchange(provider.profile, ctx);
    const raw = wire(family, [edit(), { tool: 'get_slide', args: { slideId: 's1', owner: 'foreign' } }]);
    const result = parseProviderExchange(provider.profile, prep, raw);
    assert.equal(result.ok, false); assert.equal(result.code, 'invalid-response');
    assert.ok(!('calls' in result)); assert.equal(document.status().revision, 0);
  });
  test(`${family}: caller mutation during HTTP cannot alter the prepared revision/catalog`, async t => {
    let release; const ready = new Promise(r => { release = r; });
    const { provider, arrived } = await endpoint(t, family, async (_req, res) => {
      await ready; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(wire(family)));
    });
    const { context: ctx, document } = await context();
    const pending = provider.exchange(ctx); await arrived;
    ctx.revision = 99; ctx.tools.splice(0); ctx.messages[0].content = 'replaced'; release();
    const result = await pending; assert.equal(result.ok, true);
    assert.equal(result.calls[0].request.args.baseRevision, 0); assert.equal(document.status().revision, 0);
  });
}
