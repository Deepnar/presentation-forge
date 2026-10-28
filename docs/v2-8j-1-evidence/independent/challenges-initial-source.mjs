import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchRunner } from '../../../packages/agent/research.ts';
import { normalizeWebResults } from '../../../src/agent/search-sources.js';
import { rig, response, searchCall } from '../../../test/v2-research-fixture.js';

test('one trusted capability cannot authorize concurrent invocations through separate runners', { timeout: 3000 }, async () => {
  const e = rig({ reply: async step => response(step % 2 ? [searchCall()] : [], step) });
  const sibling = createResearchRunner(e.backend, e.model, e.capability, e.clock);
  const results = await Promise.all([
    e.runner.research(e.owner, e.input),
    sibling.research(e.owner, e.input),
  ]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.filter(result => !result.ok).length, 1);
  assert.equal(e.calls.length, 2, 'the reused capability dispatches no second model conversation');
  assert.equal(e.searches.length, 1);
});

test('a valid search result plus final text cannot overflow the complete publication DTO', { timeout: 3000 }, async () => {
  const e = rig({
    reply: async step => response(step === 1 ? [searchCall('bounded evidence', { limit: 8 })] : [], step, 'x'.repeat(32000)),
    search: async (binding, query) => normalizeWebResults('fixture-search', binding, query, {
      results: Array.from({ length: 8 }, (_, i) => ({ url: `https://h${i}.example/` + 'p'.repeat(1900),
        title: 't'.repeat(500), content: 'e'.repeat(2000) })),
    }, { maxOutputChars: 65536, retrievedAt: '2026-10-27T00:00:00Z' }),
  });
  const result = await e.runner.research(e.owner, e.input);
  assert.equal(e.searches.length, 1);
  assert.equal(e.calls.length, 2, 'the individually valid source history fits the provider context');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'result-too-large');
  assert.equal(result.trace.sourceResults, 8);
  assert.equal(Object.hasOwn(result, 'sources'), false);
  assert.equal(Object.hasOwn(result, 'summary'), false);
  assert.ok(JSON.stringify(result).length <= 65536);
});
