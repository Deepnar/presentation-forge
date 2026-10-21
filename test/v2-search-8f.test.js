import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebResults, searchRequest, searchBinding } from '../src/agent/search-sources.js';
import { validateSourceRef } from '../packages/model/validate.ts';

const binding = { projectId: 'project-safe' };
const request = { query: 'solid state batteries' };
const row = (url = 'https://example.org/review', title = 'Review', content = 'Evidence') => ({ url, title, content });
const normalize = (rows, req = request, opts = {}, provider = 'searxng', bound = binding) =>
  normalizeWebResults(provider, bound, req, { results: rows }, opts);

test('search requests and trusted project binding stay separate', () => {
  assert.deepEqual(searchRequest({ query: '  batteries  ', limit: 20, perHost: 5, language: 'en-IN', timeRange: 'year' }),
    { query: 'batteries', limit: 20, perHost: 5, language: 'en-IN', timeRange: 'year' });
  assert.ok(searchBinding(binding));
  for (const extra of ['projectId','ownerId','baseURL','apiKey','x','fontFamily']) assert.equal(searchRequest({ ...request, [extra]: 'injected' }), null);
  for (const input of [{}, { query: '' }, { query: ' \t ' }, { query: 'x'.repeat(501) }, { query: 'a\u0000b' },
    { ...request, limit: 0 }, { ...request, limit: 21 }, { ...request, limit: 1.5 }, { ...request, perHost: 6 },
    { ...request, language: 'en&format=html' }, { ...request, timeRange: 'week' }]) assert.equal(searchRequest(input), null);
  for (const input of [null, {}, { projectId: '' }, { ...binding, ownerId: 'other' }, { projectId: 'p'.repeat(129) }]) assert.equal(searchBinding(input), null);
});

test('executable, cyclic and non-plain boundary objects refuse without invocation', () => {
  let invoked = 0;
  const accessor = { get query() { invoked++; return 'x'; } }, cyclic = { query: 'x' }; cyclic.self = cyclic;
  for (const value of [accessor, cyclic, new Date(), { ...request, toJSON() { invoked++; return request; } }]) assert.equal(searchRequest(value), null);
  assert.equal(searchBinding({ get projectId() { invoked++; return 'p'; } }), null);
  assert.equal(normalizeWebResults('searxng', binding, request, { get results() { invoked++; return []; } }).code, 'invalid-response');
  assert.equal(invoked, 0);
});

test('normalized sources satisfy the canonical source schema and exclude backend payloads', async () => {
  const result = normalize([{ ...row(), engine: 'private-engine', score: 99, apiKey: 'private-key', x: 4, fontFamily: 'Injected' }]);
  assert.equal(result.ok, true);
  assert.equal(result.sources.length, 1);
  assert.equal((await validateSourceRef(result.sources[0])).ok, true);
  const text = JSON.stringify(result);
  for (const forbidden of ['private-engine','private-key','score','fontFamily','rawPayload']) assert.ok(!text.includes(forbidden));
  assert.equal(result.sources[0].kind, 'web'); assert.equal(result.sources[0].projectId, binding.projectId);
});

test('source identity is stable across retrieval times, query order and provider metadata', () => {
  const first = normalize([row()], request, { retrievedAt: '2026-10-21T00:00:00Z' }).sources[0];
  const next = normalize([row('https://other.org/'), row()], { query: 'different query' }, { retrievedAt: '2026-10-22T00:00:00Z' }, 'another-backend').sources[1];
  assert.equal(next.id, first.id); assert.notEqual(next.retrievedAt, first.retrievedAt); assert.notEqual(next.searchProvider, first.searchProvider);
  for (const changed of [row(undefined, 'Different title'), row(undefined, undefined, 'Changed evidence'),
    row('https://example.org/new'), { ...row(), publishedDate: '2026-01-01' }]) assert.notEqual(normalize([changed]).sources[0].id, first.id);
  assert.notEqual(normalize([row()], request, {}, 'searxng', { projectId: 'other-project' }).sources[0].id, first.id);
});

test('canonical URL identity removes fragments and normalizes host/default port', () => {
  const first = normalize([row('https://EXAMPLE.org:443/review#one')]).sources[0];
  assert.equal(first.url, 'https://example.org/review');
  assert.equal(first.id, normalize([row('https://example.org/review#two')]).sources[0].id);
  assert.notEqual(first.id, normalize([row('https://example.org/review?q=other')]).sources[0].id);
});

test('rank, URL deduplication and host diversity are deterministic', () => {
  const result = normalize([row('https://a.org/1'), row('https://a.org/1#duplicate'), row('https://www.a.org/2'),
    row('https://a.org/3'), row('https://b.org/1'), row('https://c.org/1')], { ...request, limit: 3 });
  assert.deepEqual(result.sources.map(s => s.url), ['https://a.org/1','https://www.a.org/2','https://b.org/1']);
  assert.deepEqual(result.warnings, ['results-truncated']);
  assert.equal(normalize(Array.from({ length: 20 }, (_, i) => row(`https://h${i}.org/`))).sources.length, 8);
  assert.equal(normalize([row('https://a.org/1'), row('https://www.a.org/2')], { ...request, perHost: 1 }).sources.length, 1);
});

test('malformed rows and unsafe citation URLs are discarded with an explicit warning', () => {
  const invalid = [null, 1, [], {}, row('javascript:alert(1)'), row('file:///private'), row('data:text/html,x'),
    row('https://user:private-key@example.org/'), row('https://example.org/\n'), row('/relative'), row(undefined, ''),
    { ...row(), content: 3 }, { ...row(), publishedDate: {} }];
  const result = normalize([...invalid, row()]);
  assert.equal(result.ok, true); assert.equal(result.sources.length, 1); assert.deepEqual(result.warnings, ['invalid-results']);
  assert.ok(!JSON.stringify(result).includes('private-key'));
});

test('snippets become bounded plain text without executing or retaining executable markup', () => {
  const result = normalize([row(undefined, '<b>Title &amp; context</b>', '<script>private-key</script><style>secret</style><b>Evidence</b> &lt;untrusted&gt;\n next')]);
  assert.equal(result.sources[0].title, 'Title & context');
  assert.equal(result.sources[0].excerpt, 'Evidence <untrusted> next');
  assert.ok(!JSON.stringify(result).includes('private-key'));
  const long = normalize([row(undefined, 't'.repeat(600), 'e'.repeat(3000))]).sources[0];
  assert.equal(long.title.length, 500); assert.equal(long.excerpt.length, 2000);
});

test('partial upstream results remain successful but distinguish backend failures from empty search', () => {
  const partial = normalizeWebResults('searxng', binding, request, { results: [row()], unresponsive_engines: [['secret-engine','private-body']] });
  assert.deepEqual(partial.warnings, ['partial-results']); assert.ok(!JSON.stringify(partial).includes('secret-engine'));
  const empty = normalize([]); assert.deepEqual(empty.sources, []); assert.deepEqual(empty.warnings, []);
});

test('malformed envelopes and oversized candidate sets refuse rather than masquerading as empty', () => {
  for (const raw of [null, [], {}, { results: null }, { results: {} }, { results: [], unresponsive_engines: {} },
    { results: Array(1001).fill(null) }]) assert.equal(normalizeWebResults('searxng', binding, request, raw).code, 'invalid-response');
});

test('serialized output budget is exact and never emits an oversized partial citation set', () => {
  const rows = [row(undefined, 't'.repeat(500), 'e'.repeat(2000))], options = { retrievedAt: '2026-10-21T00:00:00Z' };
  const good = normalize(rows, request, options), size = JSON.stringify(good).length;
  assert.equal(normalize(rows, request, { ...options, maxOutputChars: size }).ok, true);
  const refused = normalize(rows, request, { ...options, maxOutputChars: size - 1 });
  assert.equal(refused.code, 'result-too-large'); assert.ok(!JSON.stringify(refused).includes('eeeeeeee'));
});

test('returned citation content and nested result collections are immutable', () => {
  const result = normalize([row()]);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.sources)); assert.ok(Object.isFrozen(result.sources[0])); assert.ok(Object.isFrozen(result.warnings));
  assert.throws(() => { result.sources[0].title = 'mutated'; });
});

test('malformed normalization options cannot execute getters or supply backend fields', () => {
  let invoked = 0;
  assert.equal(normalize([row()], request, { get maxOutputChars() { invoked++; return 32000; } }).ok, false);
  assert.equal(invoked, 0);
  for (const options of [{ maxOutputChars: 1023 }, { maxOutputChars: 65537 }, { retrievedAt: 'invalid' }, { baseURL: 'https://other.invalid' }])
    assert.equal(normalize([row()], request, options).ok, false);
  assert.equal(normalize([row()], request, {}, 3).code, 'invalid-request');
});

test('normalization handles malformed Unicode and excessive fields within canonical bounds', () => {
  const result = normalize([row(undefined, 'Hello\ud800', 'world\udc00')]);
  assert.equal(result.sources[0].title, 'Hello\ufffd'); assert.equal(result.sources[0].excerpt, 'world\ufffd');
  assert.deepEqual(normalize([row(undefined, 'x'.repeat(20001))]).warnings, ['invalid-results']);
});

test('plain snippets preserve block and line-break word boundaries without splitting inline words', () => {
  for (const [markup, expected] of [
    ['<p>First</p><p>Second</p>', 'First Second'],
    ['First<br>Second', 'First Second'],
    ['<ul><li>First</li><li>Second</li></ul>', 'First Second'],
    ['<table><tr><td>First</td><td>Second</td></tr></table>', 'First Second'],
    ['inter<em>op</em>erability', 'interoperability'],
  ]) assert.equal(normalize([row(undefined, undefined, markup)]).sources[0].excerpt, expected);
});
