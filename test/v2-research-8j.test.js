import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatedToolRequest, semanticToolCatalog } from '../packages/tools/session.ts';
import { createResearchRunner } from '../packages/agent/research.ts';
import { parsePlan, parseReceipt, parseConversationRequest, parseProviderRunRequest } from '../packages/agent/run-state.ts';
import { prepareExchange, providerProfile } from '../packages/agent/provider.ts';
import { rig as contentRig } from './v2-tool-fixture.js';
import { rig, results, searchCall, response, deferred, until } from './v2-research-fixture.js';
const check = (name, body) => test('Research: ' + name, { timeout: 3000 }, body);
check('canonical search is a strict subset of standalone F and base sessions refuse it', async () => {
  const f = JSON.parse(await readFile(new URL('../packages/agent/search-request.schema.json', import.meta.url)));
  assert.equal(f.properties.limit.maximum, 20); assert.equal(f.properties.perHost.maximum, 5);
  assert.ok(validatedToolRequest(searchCall())); assert.equal(validatedToolRequest(searchCall('x', { limit: 9 })), null);
  assert.equal(validatedToolRequest(searchCall('x', { perHost: 3 })), null);
  for (const key of ['projectId','owner','baseURL','apiKey','x','fontFamily','queryDisclosure']) assert.equal(validatedToolRequest(searchCall('x', { [key]: 'private' })), null);
  const { tools } = await contentRig(); assert.deepEqual(tools.catalog().map(t => t.name), ['get_project','get_slide','get_selected_elements','edit_content']);
  assert.equal((await tools.execute(searchCall())).code, 'forbidden');
  assert.equal(semanticToolCatalog().length, 5);
});
check('queued plans receipts and initial-read contracts still exclude network tools', async () => {
  const e = rig(), plan = { requestId: 'p', projectRevision: 0, scope: e.input.scope, steps: [searchCall()], maxSteps: 1, maxFailures: 1, deadlineAt: e.input.deadlineAt };
  assert.throws(() => parsePlan(plan));
  assert.throws(() => parseReceipt({ step: 0, tool: 'web_search', ok: true, code: null, changed: false, projectRevision: 0, engineRevision: 0, runRevision: 1 }));
  assert.equal(parseConversationRequest({ ...e.input, reads: [searchCall()] }), null);
  const { limits, ...base } = e.input; assert.equal(parseProviderRunRequest({ ...base, reads: [searchCall()] }), null);
});
check('missing forged and mutable grants never silently expand permission', async () => {
  const absent = rig({ missing: true }); assert.equal((await absent.runner.research(absent.owner, absent.input)).code, 'search-denied'); assert.equal(absent.calls.length, 0);
  const denied = rig({ authorize: async () => false }); assert.equal((await denied.runner.research(denied.owner, denied.input)).code, 'search-denied'); assert.equal(denied.calls.length, 0);
  const e = rig(); e.capability.grant.binding.id = 'other'; e.capability.grant.queryDisclosure = false;
  assert.equal((await e.runner.research(e.owner, e.input)).ok, true); assert.equal(e.searches[0].binding.projectId, 'project');
  assert.equal((await e.runner.research(e.owner, e.input)).code, 'grant-used'); assert.equal(e.searches.length, 1);
  const bad = rig({ grant: { queryDisclosure: false } }); assert.equal((await bad.runner.research(bad.owner, bad.input)).code, 'search-denied');
});
check('the whole request is captured and mismatches cannot spend or expand its grant', async () => {
  const e = rig();
  for (const change of [r => { r.request = 'Search the private slide instead.'; }, r => { r.scope.readableSlides.push('s2'); },
    r => { r.scope.selection = []; }, r => { r.reads = [{ tool: 'get_project', args: {} }]; },
    r => { r.maxOutputTokens++; }, r => { r.deadlineAt++; }]) {
    const changed = structuredClone(e.input); change(changed);
    assert.equal((await e.runner.research(e.owner, changed)).code, 'invalid-request');
    assert.equal(e.calls.length, 0); assert.equal(e.searches.length, 0);
  }
  e.capability.grant.request.request = 'A later mutation is not permission.';
  const reordered = Object.fromEntries(Object.entries(e.input).reverse());
  reordered.scope = Object.fromEntries(Object.entries(e.input.scope).reverse());
  assert.equal((await e.runner.research(e.owner, reordered)).ok, true);
  const sibling = createResearchRunner(e.backend, e.model, e.capability, e.clock);
  assert.equal((await sibling.research(e.owner, e.input)).code, 'grant-used');
  assert.equal(e.searches.length, 1);
});
check('research reads only granted semantics and retains sources after final text', async () => {
  const e = rig(), initial = structuredClone(e.doc), result = await e.runner.research(e.owner, e.input);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.outcome, 'research'); assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].projectId, 'project'); assert.equal(result.trace.exchanges, 2); assert.equal(result.trace.searchCalls, 1);
  assert.equal(e.calls[1].options.history[0].results[0].tool, 'web_search'); assert.equal(e.calls[1].options.history[0].results[0].changed, false);
  const text = JSON.stringify(e.calls); for (const hidden of ['Unrelated private slide','112233','editableTargets']) assert.equal(text.includes(hidden), false, hidden);
  assert.deepEqual(e.doc, initial); assert.throws(() => { result.sources[0].title = 'changed'; }, TypeError);
});
check('provider catalog cannot combine search and edit authority', async () => {
  const e = rig(); await e.runner.research(e.owner, e.input); const context = structuredClone(e.calls[0].context);
  context.tools = [semanticToolCatalog().find(t => t.name === 'web_search'), semanticToolCatalog().find(t => t.name === 'edit_content')];
  assert.equal(prepareExchange(providerProfile(e.model.profile), context).code, 'invalid-request');
});
check('edit scope authority arguments and executable requests refuse before work', async () => {
  for (const changed of [e => { e.input.scope.mode = 'edit'; }, e => { e.input.owner = 'other'; }, e => { e.input.limits.maxExchanges = 5; }, e => { e.input.deadlineAt += 30000; }, e => { e.input.requestId = 'other'; }]) {
    const e = rig(); changed(e); assert.equal((await e.runner.research(e.owner, e.input)).code, 'invalid-request'); assert.equal(e.calls.length, 0);
  }
  let invoked = 0; const e = rig(); const input = { ...e.input, get request() { invoked++; return 'x'; } };
  assert.equal((await e.runner.research(e.owner, input)).code, 'invalid-request'); assert.equal(invoked, 0);
});
check('duplicate tool IDs refuse without a second search and search caps are aggregate', async () => {
  const duplicate = rig({ reply: async () => response([searchCall()], 1) });
  assert.equal((await duplicate.runner.research(duplicate.owner, duplicate.input)).code, 'invalid-response'); assert.equal(duplicate.searches.length, 1);
  const capped = rig({ reply: async step => response([searchCall()], step) });
  assert.equal((await capped.runner.research(capped.owner, capped.input)).code, 'budget-exhausted'); assert.equal(capped.searches.length, 3);
  const rows = rig({ grant: { maxResults: 1 }, reply: async step => response([searchCall()], step) });
  assert.equal((await rows.runner.research(rows.owner, rows.input)).code, 'budget-exhausted'); assert.equal(rows.searches.length, 1);
});
check('search failure stops the invocation without retries or a success DTO', async () => {
  for (const search of [async () => ({ ok: false, code: 'rate-limited', message: 'private backend text' }), async () => { throw new Error('private endpoint'); }]) {
    const e = rig({ search }), result = await e.runner.research(e.owner, e.input);
    assert.equal(result.code, 'search-failed'); assert.equal(e.calls.length, 1); assert.equal(e.searches.length, 1); assert.equal(result.trace.searchCalls, 1);
    assert.equal(JSON.stringify(result).includes('private'), false); assert.equal(result.trace.reportedInputTokens, 12);
  }
});
check('foreign forged and unsupported source bodies never reach provider continuation', async () => {
  for (const change of [s => { s.projectId = 'foreign'; }, s => { s.id = 'src_' + '0'.repeat(64); }, s => { s.locator = 'fabricated page'; }, s => { s.kind = 'paper'; }, s => { s.url = 'javascript:alert(1)'; }]) {
    const e = rig({ search: async (b, q) => { const r = structuredClone(results(b, q)); change(r.sources[0]); return r; } });
    assert.equal((await e.runner.research(e.owner, e.input)).code, 'invalid-response'); assert.equal(e.calls.length, 1);
  }
});
check('repeated normalized identity keeps first retrieval provenance and counts returned rows', async () => {
  let step = 0; const e = rig({ reply: async n => response(n < 3 ? [searchCall()] : [], n),
    search: async (b, q) => { const r = structuredClone(results(b, q)); r.sources[0].retrievedAt = `2026-10-27T00:00:0${step++}Z`; return r; } });
  const result = await e.runner.research(e.owner, e.input); assert.equal(result.ok, true); assert.equal(result.sources.length, 1);
  assert.equal(result.trace.sourceResults, 2); assert.equal(result.sources[0].retrievedAt, '2026-10-27T00:00:00Z');
});
check('revocation or saved revision change during search blocks publication and later exchanges', async () => {
  let permitted = true; const revoked = rig({ authorize: async () => permitted, search: async (b, q) => { permitted = false; return results(b, q); } });
  assert.equal((await revoked.runner.research(revoked.owner, revoked.input)).code, 'search-denied'); assert.equal(revoked.calls.length, 1);
  const e = rig({ search: async (b, q) => { e.doc.revision++; return results(b, q); } });
  assert.equal((await e.runner.research(e.owner, e.input)).code, 'stale-project'); assert.equal(e.calls.length, 1);
});
check('cancelled non-cooperating model retains unknown usage and cannot dispatch late tools', async () => {
  const held = deferred(), e = rig({ reply: async () => held.promise }), controller = new AbortController();
  const work = e.runner.research(e.owner, e.input, { signal: controller.signal }); await until(() => e.calls.length);
  controller.abort(); const result = await work; assert.equal(result.code, 'cancelled'); assert.equal(result.trace.reportedInputTokens, null); assert.equal(result.trace.reservedOutputTokens, 128);
  held.resolve(response([searchCall()])); await new Promise(r => setImmediate(r)); assert.equal(e.searches.length, 0);
});
check('deadline and cancellation fence non-cooperating search without another exchange', async () => {
  for (const mode of ['deadline','cancel']) {
    const held = deferred(), e = rig({ search: async () => held.promise }), controller = new AbortController();
    const work = e.runner.research(e.owner, e.input, { signal: controller.signal }); await until(() => e.searches.length);
    if (mode === 'deadline') e.time(e.input.deadlineAt); else controller.abort();
    held.resolve(results({ projectId: 'project' }, searchCall().args));
    const result = await work; assert.equal(result.code, mode === 'deadline' ? 'deadline' : 'cancelled'); assert.equal(e.calls.length, 1); assert.equal(e.searches[0].options.signal.aborted, true);
  }
});

check('provider context and search query callbacks cannot rewrite captured evidence', async () => {
  let mutations = 0;
  const e = rig({ reply: async (step, context, options) => {
    try { context.messages[1].content = 'rewritten request'; mutations++; } catch {}
    if (options.history.length) try { options.history[0].results[0].data.sources[0].title = 'rewritten source'; mutations++; } catch {}
    return response(step === 1 ? [searchCall()] : [], step);
  }, search: async (binding, query) => {
    try { query.query = 'rewritten query'; mutations++; } catch {}
    return results(binding, query);
  } });
  assert.equal((await e.runner.research(e.owner, e.input)).ok, true); assert.equal(mutations, 0);
  assert.ok(e.calls[1].context.messages[1].content.includes('Find evidence for this slide.'));
});
check('controlled search and parent deadlines bound non-cooperating callbacks and clean timers', async () => {
  for (const mode of ['search','authorization']) {
    const held = deferred(), timers = new Map(); let id = 0;
    const e = rig(mode === 'search' ? { search: async () => held.promise } : { authorize: async () => held.promise });
    e.clock.timer = (fn, ms) => { const key = ++id; timers.set(key, { ms, fn: () => { timers.delete(key); fn(); } }); return key; };
    e.clock.untimer = key => timers.delete(key);
    const pending = e.runner.research(e.owner, e.input);
    await until(() => mode === 'search' ? e.searches.length : e.grants());
    const timer = [...timers.values()].find(t => t.ms === (mode === 'search' ? 10000 : 20000)); assert.ok(timer); timer.fn();
    const result = await pending; assert.equal(result.code, mode === 'search' ? 'search-failed' : 'deadline');
    if (mode === 'search') assert.equal(result.searchCode, 'timeout');
    held.resolve(mode === 'search' ? results({ projectId: 'project' }, searchCall().args) : true);
    await new Promise(r => setImmediate(r)); assert.equal(timers.size, 0); assert.equal(e.calls.length, mode === 'search' ? 1 : 0);
  }
});
