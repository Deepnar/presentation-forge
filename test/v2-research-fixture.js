import { createResearchRunner } from '../packages/agent/research.ts';
import { normalizeWebResults } from '../src/agent/search-sources.js';
import { seed } from './v2-tool-fixture.js';
import { caps } from './v2-provider-fixture.js';
export const searchCall = (query = 'battery evidence', extra = {}) => ({ tool: 'web_search', args: { query, limit: 1, ...extra } });
export const researchInput = (extra = {}) => ({ requestId: 'research-1', projectRevision: 0,
  scope: { mode: 'inspect', readableSlides: ['s1'], editableTargets: [], selection: [{ slideId: 's1', elementId: 'text' }] },
  request: 'Find evidence for this slide.', reads: [{ tool: 'get_selected_elements', args: {} }],
  deadlineAt: Date.now() + 20000, contextChars: 48000, maxOutputTokens: 128,
  limits: { maxExchanges: 4, maxToolCalls: 16, maxOutputTokensTotal: 512 }, ...extra });
export const results = (binding, query, extra = {}) => normalizeWebResults('fixture-search', binding, query, {
  results: [{ url: 'https://example.org/evidence', title: 'Evidence', content: 'A measured result.', ...extra }],
}, { retrievedAt: '2026-10-27T00:00:00Z' });
export function rig(options = {}) {
  const owner = { owner: 'owner', id: 'project' }, doc = { id: 'project', revision: 0, scenes: seed() };
  let at = Date.now(); const clock = { now: () => at, timer: setTimeout, untimer: clearTimeout };
  const calls = [], searches = []; let grants = 0;
  const backend = { withRuntimeTransaction: async (identity, work) => {
    if (identity.owner !== owner.owner || identity.id !== doc.id) throw Object.assign(new Error('private'), { code: 'not-found' });
    return work({ doc, now: async () => at });
  } };
  const input = researchInput({ deadlineAt: at + 20000 });
  const model = { profile: { id: 'fixture-model', family: 'openai-compatible', model: 'fixture', capabilities: caps() },
    async exchange(context, exchangeOptions) {
      calls.push({ context: structuredClone(context), options: { ...exchangeOptions, history: structuredClone(exchangeOptions.history) } });
      if (options.reply) return options.reply(calls.length, context, exchangeOptions);
      return response(calls.length === 1 ? [searchCall()] : [], calls.length);
    } };
  const capability = { grant: { binding: { ...owner }, request: structuredClone(input), queryDisclosure: true, ...options.grant },
    authorize: async (...args) => { grants++; return options.authorize ? options.authorize(...args) : true; },
    searchProvider: { id: 'fixture-search', async search(binding, query, searchOptions) {
      searches.push({ binding, query, options: searchOptions });
      return options.search ? options.search(binding, query, searchOptions) : results(binding, query);
    } } };
  const runner = createResearchRunner(backend, model, options.missing ? undefined : capability, clock);
  return { runner, owner, input, doc, model, backend, capability, calls, searches, clock, grants: () => grants, time: value => { at = value; } };
}
export function response(requests = [], step = 1, text = 'Unverified model summary.') {
  return { ok: true, providerId: 'fixture-model', family: 'openai-compatible', model: 'fixture',
    outcome: requests.length ? 'tool-calls' : 'text', text: requests.length ? '' : text,
    calls: requests.map((request, i) => ({ id: `call-${step}-${i}`, request })), usage: { inputTokens: 12, outputTokens: 2 } };
}
export function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
export async function until(read) {
  for (let i = 0; i < 100; i++) { if (read()) return; await new Promise(r => setImmediate(r)); }
  throw new Error('Fixture callback did not run.');
}
