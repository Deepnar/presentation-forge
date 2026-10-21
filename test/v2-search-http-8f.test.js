import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createSearxngSearchProvider } from '../src/agent/search-provider.js';

const binding = { projectId: 'private-project-id' }, query = { query: 'battery & safety', language: 'en-IN', timeRange: 'year', limit: 3 };
const response = { results: [{ url: 'https://example.org/review', title: 'Review', content: 'Useful evidence' }] };
async function endpoint(t, handler, config = {}) {
  const seen = []; let arrive;
  const arrived = new Promise(resolve => { arrive = resolve; });
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    seen.push({ url: req.url, method: req.method, headers: req.headers, body }); arrive();
    if (handler) return handler(req, res);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(response));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { provider: createSearxngSearchProvider({ baseURL: `http://127.0.0.1:${server.address().port}/forge`, timeoutMs: 1000, ...config }), seen, arrived };
}

test('real form POST encodes query fields while keeping project identity and limits local', async t => {
  const { provider, seen } = await endpoint(t);
  const result = await provider.search(binding, query);
  assert.equal(result.ok, true); assert.equal(result.sources.length, 1);
  assert.equal(seen[0].url, '/forge/search'); assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].headers['content-type'], 'application/x-www-form-urlencoded');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(seen[0].body)), { q: query.query, format: 'json', categories: 'general', language: 'en-IN', time_range: 'year' });
  assert.ok(!JSON.stringify(seen).includes(binding.projectId));
});

test('invalid query, rebinding fields and executable accessors refuse before network', async t => {
  const { provider, seen } = await endpoint(t); let invoked = 0;
  for (const input of [{ query: '' }, { ...query, baseURL: 'https://other.invalid' }, { ...query, projectId: 'other' },
    { get query() { invoked++; return 'x'; } }]) assert.equal((await provider.search(binding, input)).code, 'invalid-request');
  assert.equal((await provider.search(binding, query, { get signal() { invoked++; return undefined; } })).code, 'invalid-request');
  assert.equal(invoked, 0); assert.equal(seen.length, 0);
});

test('configuration is immutable, sanitized and never accepts URL credentials or query options', () => {
  const config = { baseURL: 'https://search.example.org', id: 'shared-search' }, provider = createSearxngSearchProvider(config);
  config.id = 'changed'; assert.equal(provider.id, 'shared-search'); assert.ok(Object.isFrozen(provider));
  for (const bad of [{ baseURL: 'http://remote.example.org' }, { baseURL: 'https://user:secret@search.example.org' },
    { baseURL: 'https://search.example.org?key=secret' }, { baseURL: 'https://search.example.org/#fragment' }, { apiKey: 'secret' },
    { timeoutMs: 0 }, { maxResponseBytes: 0 }, { maxOutputChars: 0 }, { id: 3 }]) assert.throws(() => createSearxngSearchProvider(bad), e => !e.message.includes('secret'));
});

for (const [status, code] of [[401,'search-denied'],[403,'search-denied'],[429,'rate-limited'],[500,'search-unavailable'],[302,'search-unavailable']])
  test(`HTTP ${status} is sanitized with no retry or redirect`, async t => {
    const { provider, seen } = await endpoint(t, (_req, res) => { res.writeHead(status, { 'content-type': 'application/json', location: 'http://127.0.0.1:1/private' }); res.end('private-backend-error'); });
    const result = await provider.search(binding, query); assert.equal(result.code, code); assert.equal(seen.length, 1);
    assert.ok(!JSON.stringify(result).includes('private-backend-error'));
  });

test('pre-dispatch and in-flight header cancellation are bounded', async t => {
  const { provider, seen, arrived } = await endpoint(t, () => {}), before = new AbortController(); before.abort();
  assert.equal((await provider.search(binding, query, { signal: before.signal })).code, 'cancelled'); assert.equal(seen.length, 0);
  const during = new AbortController(), pending = provider.search(binding, query, { signal: during.signal });
  await arrived; during.abort(); assert.equal((await pending).code, 'cancelled'); assert.equal(seen.length, 1);
});

test('body cancellation covers an incomplete JSON stream', async t => {
  const { provider, arrived } = await endpoint(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{'); });
  const controller = new AbortController(), pending = provider.search(binding, query, { signal: controller.signal });
  await arrived; controller.abort(); assert.equal((await pending).code, 'cancelled');
});

test('deadline includes a stalled body without retries', async t => {
  const { provider, seen } = await endpoint(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{'); }, { timeoutMs: 40 });
  const at = performance.now(); assert.equal((await provider.search(binding, query)).code, 'timeout');
  assert.ok(performance.now() - at < 2000); assert.equal(seen.length, 1);
});

for (const declared of [true, false]) test(`${declared ? 'declared' : 'chunked'} byte overflow refuses`, async t => {
  const { provider } = await endpoint(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json', ...(declared ? { 'content-length': '10000' } : {}) }); res.end('x'.repeat(10000)); }, { maxResponseBytes: 256 });
  assert.equal((await provider.search(binding, query)).code, 'response-too-large');
});

for (const [type, body] of [['text/html','<html>private error</html>'],['application/json','{bad'],['application/json',Buffer.from([0xff,0xfe])],['application/json','{}']])
  test(`invalid ${type} / ${Buffer.isBuffer(body) ? 'UTF8' : body.slice(0, 12)} refuses`, async t => {
    const { provider } = await endpoint(t, (_req, res) => { res.writeHead(200, { 'content-type': type }); res.end(body); });
    assert.equal((await provider.search(binding, query)).code, 'invalid-response');
  });

test('non-cooperating injected fetch cannot defeat timeout or start a late body read', async () => {
  let resolveFetch, cancelled = 0, reads = 0;
  const provider = createSearxngSearchProvider({ timeoutMs: 20 }, { fetch: () => new Promise(resolve => { resolveFetch = resolve; }) });
  assert.equal((await provider.search(binding, query)).code, 'timeout');
  resolveFetch({ body: { async cancel() { cancelled++; }, getReader() { reads++; throw new Error('late read'); } } });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, 1); assert.equal(reads, 0);
});

test('request inputs are snapshotted before network waits', async t => {
  const { provider, arrived } = await endpoint(t, (_req, res) => { setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(response)); }, 20); });
  const owner = { ...binding }, input = { ...query }, pending = provider.search(owner, input);
  await arrived; owner.projectId = 'rebound'; input.query = 'changed';
  const result = await pending; assert.equal(result.sources[0].projectId, binding.projectId);
});

test('transport errors never expose endpoint details or raw failure text', async () => {
  const provider = createSearxngSearchProvider({ baseURL: 'https://private-endpoint.invalid' }, { fetch: async () => { throw new Error('private-endpoint.invalid secret'); } });
  const result = await provider.search(binding, query); assert.equal(result.code, 'search-unavailable');
  assert.ok(!JSON.stringify(result).includes('private-endpoint')); assert.ok(!JSON.stringify(result).includes('secret'));
});

test('configuration accessors refuse without invoking them', () => {
  let invoked = 0;
  assert.throws(() => createSearxngSearchProvider({ get baseURL() { invoked++; return 'https://private.invalid'; } }));
  assert.equal(invoked, 0);
});

test('header deadline is bounded before the backend sends a response', async t => {
  const { provider, seen } = await endpoint(t, () => {}, { timeoutMs: 40 });
  assert.equal((await provider.search(binding, query)).code, 'timeout'); assert.equal(seen.length, 1);
});

test('response bytes count UTF8 encoding rather than string characters', async t => {
  const body = JSON.stringify({ results: [], unused: 'é'.repeat(160) });
  assert.ok(body.length < 256); assert.ok(Buffer.byteLength(body) > 256);
  const { provider } = await endpoint(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(body); }, { maxResponseBytes: 256 });
  assert.equal((await provider.search(binding, query)).code, 'response-too-large');
});

for (const delta of [0, 1]) test(`exact byte boundary ${delta ? 'overflow' : 'passes'}`, async t => {
  const base = { ...response, unused: '' }, size = Buffer.byteLength(JSON.stringify(base));
  const body = JSON.stringify({ ...base, unused: 'x'.repeat(256 - size + delta) }); assert.equal(Buffer.byteLength(body), 256 + delta);
  const { provider } = await endpoint(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(body); }, { maxResponseBytes: 256 });
  const result = await provider.search(binding, query);
  if (delta) assert.equal(result.code, 'response-too-large'); else assert.equal(result.ok, true);
});

test('normalized output budget remains distinct from HTTP response bytes', async t => {
  const { provider } = await endpoint(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ results: [{ ...response.results[0], content: 'e'.repeat(2000) }] })); }, { maxOutputChars: 1024 });
  assert.equal((await provider.search(binding, query)).code, 'result-too-large');
});

test('non-cooperating fetch cancellation fences a later response', async () => {
  let resolveFetch, reads = 0, cancelled = 0;
  const provider = createSearxngSearchProvider({}, { fetch: () => new Promise(resolve => { resolveFetch = resolve; }) });
  const controller = new AbortController(), pending = provider.search(binding, query, { signal: controller.signal });
  controller.abort(); assert.equal((await pending).code, 'cancelled');
  resolveFetch({ body: { async cancel() { cancelled++; }, getReader() { reads++; } } });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(reads, 0); assert.equal(cancelled, 1);
});

test('non-cooperating body stream is cancelled on the whole-operation deadline', async () => {
  let cancelled = 0;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled++; } });
  const provider = createSearxngSearchProvider({ timeoutMs: 20 }, { fetch: async () => new Response(body, { headers: { 'content-type': 'application/json' } }) });
  assert.equal((await provider.search(binding, query)).code, 'timeout');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, 1);
});

test('an actual partial-engine HTTP response exposes only normalized data and warning codes', async t => {
  const { provider } = await endpoint(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ...response, unresponsive_engines: [['private-engine','private-diagnostic']], answers: ['untrusted private answer'] })); });
  const result = await provider.search(binding, query); assert.equal(result.ok, true); assert.deepEqual(result.warnings, ['partial-results']);
  for (const raw of ['private-engine', 'private-diagnostic', 'untrusted private answer']) assert.ok(!JSON.stringify(result).includes(raw));
  assert.equal(result.sources[0].projectId, binding.projectId);
});
